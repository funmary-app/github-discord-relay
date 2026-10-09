import { describe, expect, it } from 'vitest';
import { isPrivateRepositoryEvent, relay, verifySignature, type Env } from './relay';

const SECRET = 'test-secret';
const ENV: Env = {
	GITHUB_WEBHOOK_SECRET: SECRET,
	DISCORD_WEBHOOK_URL: 'https://discord.example.com/api/webhooks/1/token',
};

const sign = async (body: string, secret = SECRET): Promise<string> => {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
	return `sha256=${[...mac].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
};

const post = async (payload: unknown, options: { secret?: string } = {}): Promise<Request> => {
	const body = JSON.stringify(payload);
	return new Request('https://relay.example.com/', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'x-github-event': 'push',
			'x-github-delivery': 'delivery-1',
			'x-hub-signature-256': await sign(body, options.secret),
		},
		body,
	});
};

const recorder = () => {
	const calls: { url: string; init: RequestInit }[] = [];
	const forward = async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(null, { status: 204 });
	};
	return { calls, forward };
};

describe('verifySignature', () => {
	it('正しい署名を受け入れる', async () => {
		const body = '{"a":1}';
		const buffer = new TextEncoder().encode(body).buffer;
		expect(await verifySignature(SECRET, buffer, await sign(body))).toBe(true);
	});

	it('秘密が違う、署名がない、形が崩れているものは断る', async () => {
		const body = '{"a":1}';
		const buffer = new TextEncoder().encode(body).buffer;
		expect(await verifySignature(SECRET, buffer, await sign(body, 'other'))).toBe(false);
		expect(await verifySignature(SECRET, buffer, null)).toBe(false);
		expect(await verifySignature(SECRET, buffer, 'sha256=zz')).toBe(false);
		expect(await verifySignature(SECRET, buffer, 'sha1=abcd')).toBe(false);
	});
});

describe('isPrivateRepositoryEvent', () => {
	it('非公開のリポジトリのイベントだけを true にする', () => {
		expect(isPrivateRepositoryEvent({ repository: { private: true } })).toBe(true);
		expect(isPrivateRepositoryEvent({ repository: { private: false } })).toBe(false);
	});

	it('リポジトリを持たないイベントや、形が違うものは非公開として扱わない', () => {
		expect(isPrivateRepositoryEvent({ organization: {} })).toBe(false);
		expect(isPrivateRepositoryEvent({ repository: null })).toBe(false);
		expect(isPrivateRepositoryEvent(null)).toBe(false);
		expect(isPrivateRepositoryEvent('x')).toBe(false);
	});
});

describe('relay', () => {
	it('公開リポジトリのイベントを、Discord の /github に本文のまま転送する', async () => {
		const { calls, forward } = recorder();
		const payload = { repository: { private: false }, n: 1 };
		const response = await relay(await post(payload), ENV, forward);
		expect(response.status).toBe(204);
		expect(calls).toHaveLength(1);
		expect(calls[0]!.url).toBe('https://discord.example.com/api/webhooks/1/token/github');
		const headers = new Headers(calls[0]!.init.headers);
		expect(headers.get('x-github-event')).toBe('push');
		expect(headers.get('x-github-delivery')).toBe('delivery-1');
		expect(headers.get('x-hub-signature-256')).toBeNull();
		expect(new TextDecoder().decode(calls[0]!.init.body as ArrayBuffer)).toBe(JSON.stringify(payload));
	});

	it('非公開リポジトリのイベントは、転送せずに 204 を返す', async () => {
		const { calls, forward } = recorder();
		const response = await relay(await post({ repository: { private: true } }), ENV, forward);
		expect(response.status).toBe(204);
		expect(calls).toHaveLength(0);
	});

	it('署名が合わないものは 401 にして、転送しない', async () => {
		const { calls, forward } = recorder();
		const request = await post({ repository: { private: false } }, { secret: 'other' });
		const response = await relay(request, ENV, forward);
		expect(response.status).toBe(401);
		expect(calls).toHaveLength(0);
	});

	it('POST 以外は 405 にする', async () => {
		const { forward } = recorder();
		const response = await relay(new Request('https://relay.example.com/'), ENV, forward);
		expect(response.status).toBe(405);
	});

	it('Discord が失敗を返したら 502 にする', async () => {
		const failing = async () => new Response('x', { status: 500 });
		const response = await relay(await post({ ping: true }), ENV, failing);
		expect(response.status).toBe(502);
	});
});
