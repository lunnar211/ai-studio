"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <Button
      type="button"
      className="w-full"
      onClick={() => signIn("google", { callbackUrl: "/account" })}
    >
      Sign in with Google
    </Button>
  );
}
