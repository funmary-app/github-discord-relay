import { relay, type Env } from './relay';

export default {
	fetch: (request: Request, env: Env) => relay(request, env),
};
