"use client";

import { registerUser } from "@/actions";
import { useSAVAction } from "valiact/react";

export function RegisterForm() {
  const { onsubmit, isPending, getFieldError, errors, data } = useSAVAction(
    registerUser,
    {
      onSuccess: (data) => {
        console.log("สร้าง User สำเร็จ:", data);
      },
      onError: (errs) => {
        console.error("เกิดข้อผิดพลาด:", errs);
      },
    },
  );

  return (
    <form

      onSubmit={onsubmit}
      className="space-y-4 border-2 border-gray-600 rounded-md p-4"
    >
      <div>
        <input
          name="email"
          placeholder="Email"
          className="outline-none"
          value={data?.email}
          disabled={isPending}
        />
        <span className="text-red-500">{errors?.email}</span>
      </div>

      <div>
        <input
          name="age"
          type="number"
          placeholder="Age"
          className="outline-none"
          disabled={isPending}
          value={data?.age}
        />
        <span className="text-red-500">{errors?.age}</span>
      </div>

      <div>
        <input
          name="avatar"
          type="file"
          placeholder="Avatar"
          className="outline-none"
          disabled={isPending}
        />
        <span className="text-red-500">{errors?.avatar}</span>
      </div>

      <button type="submit" disabled={isPending}>
        {isPending ? "กำลังบันทึก..." : "สมัครสมาชิก"}
      </button>
    </form>
  );
}
