import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4">
      <Image
        src="/logo.png"
        alt="Good Deal — make it happen"
        width={538}
        height={240}
        priority
        className="h-20 w-auto"
      />
      <SignIn />
    </div>
  );
}
