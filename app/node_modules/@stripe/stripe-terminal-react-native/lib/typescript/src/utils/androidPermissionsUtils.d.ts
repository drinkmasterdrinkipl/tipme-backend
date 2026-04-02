type PermissionsProps = {
    accessFineLocation?: {
        title: string;
        message: string;
        buttonPositive: string;
    };
};
type Error = {
    error: Record<string, string> | null;
};
export declare function requestNeededAndroidPermissions({ accessFineLocation, }?: PermissionsProps | undefined): Promise<Error>;
export {};
