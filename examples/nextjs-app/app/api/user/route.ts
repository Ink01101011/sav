import { registerUser } from "@/actions";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    console.log("formData: ", formData);
    const validate = await registerUser(formData);
    if (!validate.success) {
      console.log("validate.errors: ", validate.errors);
      throw new Error(JSON.stringify(validate.errors));
    }
    return NextResponse.json({
      message: "Hello from the API route!",
      data: validate.data,
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.log("error: ", err.message)
    return NextResponse.json(
      { message: "Error occurred", error: JSON.parse(err.message) },
      { status: 500 },
    );
  }
}
