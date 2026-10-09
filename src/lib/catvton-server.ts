const SECRET_HEADER = "X-CatVTON-Secret";

function settings() {
  const base = process.env.CATVTON_API_URL?.replace(/\/+$/, "");
  const secret = process.env.CATVTON_SECRET;
  if (!base || !secret) {
    throw new Error("The try-on backend is not configured.");
  }
  return { base, secret };
}

export async function proxyTryon(request: Request): Promise<Response> {
  const { base, secret } = settings();
  const incoming = await request.formData();
  const person = incoming.get("person_image");
  const garment = incoming.get("garment_image");
  if (!(person instanceof Blob) || !(garment instanceof Blob)) {
    return Response.json({ error: "Choose a person photo and a garment photo." }, { status: 400 });
  }

  const form = new FormData();
  form.append("person_image", person, "person.jpg");
  form.append("garment_image", garment, "garment.jpg");
  form.append("cloth_type", "upper");
  const seed = incoming.get("seed");
  if (typeof seed === "string" && seed) {
    form.append("seed", seed);
  }

  const response = await fetch(`${base}/v1/tryon`, {
    method: "POST",
    headers: { [SECRET_HEADER]: secret },
    body: form,
  });
  return passJson(response);
}

function assertJobId(jobId: string) {
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(jobId)) {
    throw new Error("That job id is not valid.");
  }
}

export async function proxyJob(jobId: string): Promise<Response> {
  assertJobId(jobId);
  const { base, secret } = settings();
  const response = await fetch(`${base}/v1/jobs/${jobId}`, {
    headers: { [SECRET_HEADER]: secret },
    cache: "no-store",
  });
  return passJson(response);
}

export async function proxyCancel(jobId: string): Promise<Response> {
  assertJobId(jobId);
  const { base, secret } = settings();
  const response = await fetch(`${base}/v1/jobs/${jobId}/cancel`, {
    method: "POST",
    headers: { [SECRET_HEADER]: secret },
  });
  return passJson(response);
}

export async function proxyResult(jobId: string): Promise<Response> {
  assertJobId(jobId);
  const { base, secret } = settings();
  const response = await fetch(`${base}/v1/jobs/${jobId}/result`, {
    headers: { [SECRET_HEADER]: secret },
    cache: "no-store",
  });
  if (!response.ok) {
    return passJson(response);
  }
  const bytes = await response.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" },
  });
}

async function passJson(response: Response): Promise<Response> {
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { "content-type": "application/json" },
  });
}
