import { NextResponse } from "next/server";

import { AssignmentError } from "@/services/assignment/availability-service";
import { ClassValidationError } from "@/services/classes/validation";
import { authErrorResponse } from "@/services/auth/guards";

export function classErrorResponse(error: unknown) {
  if (error instanceof ClassValidationError || error instanceof AssignmentError) {
    return NextResponse.json(
      { success: false, data: null, error: error.message },
      { status: error.status || 400 },
    );
  }
  return authErrorResponse(error);
}
