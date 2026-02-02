export declare function getMembershipByUser(tgUserId: string): {
    spaceId: number;
    role: string;
    otherUserId: string | null;
} | null;
export declare function createSpaceWithOwner(tgUserId: string): number;
export declare function setSpacePin(spaceId: number, pinHash: string, expiresAtIso: string): void;
export declare function findSpaceByPinHash(pinHash: string): {
    spaceId: number;
    pinExpiresAt: string | null;
} | null;
export declare function countMembers(spaceId: number): number;
export declare function addMember(spaceId: number, tgUserId: string): void;
export declare function burnSpacePin(spaceId: number): void;
//# sourceMappingURL=repo.d.ts.map