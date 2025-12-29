import React from "react";
import { ClerkProvider as OriginalClerkProvider } from "@clerk/nextjs";

type ClerkProviderProps = React.ComponentProps<typeof OriginalClerkProvider>;

export function ClerkProvider({ children, ...props }: ClerkProviderProps) {
    return (
        <OriginalClerkProvider {...props}>
            {children}
        </OriginalClerkProvider>
    );
}