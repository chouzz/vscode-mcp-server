import type { Request, Response, NextFunction } from 'express';

export function createCorsMiddleware(allowOriginsRaw: string, withCredentials: boolean) {
	const allowOrigins = allowOriginsRaw.split(',').map((origin) => origin.trim()).filter(Boolean);
	const allowAnyOrigin = allowOrigins.length === 0 || allowOrigins.includes('*');

	return (request: Request, response: Response, next: NextFunction) => {
		const requestOrigin = request.headers.origin;
		const allowOrigin = allowAnyOrigin ? '*' : requestOrigin;

		if (allowOrigin && (allowAnyOrigin || (requestOrigin && allowOrigins.includes(requestOrigin)))) {
			response.header('Access-Control-Allow-Origin', allowOrigin);
		}

		if (withCredentials) {
			response.header('Access-Control-Allow-Credentials', 'true');
		}

		response.header('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');
		response.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
		response.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

		if (request.method === 'OPTIONS') {
			response.status(204).end();
			return;
		}

		next();
	};
}
