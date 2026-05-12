import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No OAuth code provided" }, { status: 400 });
  }

  // Simulate exchanging the OAuth2 code for an access token with Clio's API
  console.log(`Exchanging Clio OAuth code: ${code}`);
  
  // In a real application, securely store the token in the session or database
  const mockToken = "clio_access_token_12345";

  // Redirect the user back to the workspace with a success flag
  return NextResponse.redirect(new URL("/workspace/dashboard?clioSync=success", request.url));
}
