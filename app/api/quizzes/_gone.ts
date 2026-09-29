import { NextResponse } from "next/server";

export function quizzesRemoved() {
  return NextResponse.json(
    {
      success: false,
      data: null,
      error: "Quizzes have been removed. Use Mock exams.",
    },
    { status: 410 },
  );
}
