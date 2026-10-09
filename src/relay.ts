export interface Env {
	/** 組織の Webhook に設定した秘密。署名の検証に使う */
	GITHUB_WEBHOOK_SECRET: string;
	/** Discord の Webhook の URL。末尾に /github は付けない */
	DISCORD_WEBHOOK_URL: string;
}

/** Discord に引き継ぐヘッダー。署名は転送先で使われないので、渡さない */
const FORWARDED_HEADERS = ['content-type', 'x-github-event', 'x-github-delivery'] as const;

const encoder = new TextEncoder();

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> | null => {
	if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
	const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
	for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return bytes;
};

/** `X-Hub-Signature-256` が、本文と秘密から作った HMAC-SHA256 と一致するか。比較は時間が一定になるものを使う */
export const verifySignature = async (
	secret: string,
	body: ArrayBuffer,
	header: string | null,
): Promise<boolean> => {
	const match = header?.match(/^sha256=([0-9a-f]+)$/i);
	const signature = match?.[1] ? hexToBytes(match[1]) : null;
	if (!signature) return false;
	const key = await crypto.subtle.importKey(
		'raw',
		encoder.encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['verify'],
	);
	return crypto.subtle.verify('HMAC', key, signature, body);
};

/** 非公開リポジトリのイベントか。リポジトリを持たないイベント (組織のメンバーの変更など) は、非公開として扱わない */
export const isPrivateRepositoryEvent = (payload: unknown): boolean => {
	if (typeof payload !== 'object' || payload === null) return false;
	const repository = (payload as { repository?: unknown }).repository;
	if (typeof repository !== 'object' || repository === null) return false;
	return (repository as { private?: unknown }).private === true;
};

type Forward = (url: string, init: RequestInit) => Promise<Response>;

export const relay = async (
	request: Request,
	env: Env,
	forward: Forward = fetch,
): Promise<Response> => {
	if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

	const body = await request.arrayBuffer();
	const signed = await verifySignature(
		env.GITHUB_WEBHOOK_SECRET,
		body,
		request.headers.get('x-hub-signature-256'),
	);
	if (!signed) return new Response('Unauthorized', { status: 401 });

	let payload: unknown;
	try {
		payload = JSON.parse(new TextDecoder().decode(body));
	} catch {
		return new Response('Bad Request', { status: 400 });
	}
	if (isPrivateRepositoryEvent(payload)) return new Response(null, { status: 204 });

	const headers = new Headers();
	for (const name of FORWARDED_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const response = await forward(`${env.DISCORD_WEBHOOK_URL}/github`, {
		method: 'POST',
		headers,
		body,
	});
	return new Response(null, { status: response.ok ? 204 : 502 });
};
