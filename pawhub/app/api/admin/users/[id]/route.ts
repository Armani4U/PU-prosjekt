import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // IMPORTANT: server only
);

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const token = authHeader.replace("Bearer ", "");

  // 1) Identify caller (the admin) from their access token
  const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const callerId = callerData.user.id;

  // 2) Check caller role in your profiles table
  const { data: callerProfile, error: profErr } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();

  if (profErr || callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const targetUserId = params.id;

  // Optional safety: prevent deleting yourself
  if (targetUserId === callerId) {
    return NextResponse.json({ error: "You cannot delete yourself" }, { status: 400 });
  }

  // 3) Delete the user from Supabase Auth (this is the key step)
  const { error: delAuthErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
  if (delAuthErr) {
    return NextResponse.json({ error: delAuthErr.message }, { status: 500 });
  }

  // Optional: clean up related rows (depends on your schema / foreign keys)
  // If you have ON DELETE CASCADE from profiles -> auth.users, you may not need this.
  await supabaseAdmin.from("profiles").delete().eq("id", targetUserId);

  return NextResponse.json({ ok: true });
}