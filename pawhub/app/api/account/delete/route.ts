import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST() {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // IKKE public
  );

  // Hent bruker fra auth header
  const { data: { user }, error: userError } =
    await supabaseAdmin.auth.getUser();

  if (userError || !user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Slett auth-bruker
  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);

  if (error) {
    return new NextResponse(error.message, { status: 500 });
  }

  return new NextResponse("OK", { status: 200 });
}