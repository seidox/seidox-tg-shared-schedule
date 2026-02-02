import type { Request, Response, NextFunction } from "express";
export declare function validateTelegramInitData(initDataRaw: string, botToken: string): {
    ok: false;
    error: string;
    user?: never;
} | {
    ok: true;
    user: {
        tgUserId: string;
        firstName: any;
        username: any;
    };
    error?: never;
};
export type AuthedUser = {
    tgUserId: string;
    firstName: string;
    username: string;
};
declare global {
    namespace Express {
        interface Request {
            user?: AuthedUser;
        }
    }
}
export declare function requireTelegramAuth(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=telegramAuth.d.ts.map