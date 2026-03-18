'use client';

import { registerUser } from '@/actions/user';
import { useSAVAction } from 'sav-react';
import { useRouter } from 'next/navigation';

export function RegisterForm() {
  const router = useRouter();

  const { formAction, isPending, getFieldError } = useSAVAction(registerUser, {
    onSuccess: (data) => {
      console.log('สร้าง User สำเร็จ:', data);
      router.push('/dashboard');
    },
    onError: (errs) => {
      console.error('เกิดข้อผิดพลาด:', errs);
    }
  });

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <input name="email" placeholder="Email" disabled={isPending} />
        <span className="text-red-500">{getFieldError('email')}</span>
      </div>

      <div>
        <input name="age" type="number" placeholder="Age" disabled={isPending} />
        <span className="text-red-500">{getFieldError('age')}</span>
      </div>

      <button type="submit" disabled={isPending}>
        {isPending ? 'กำลังบันทึก...' : 'สมัครสมาชิก'}
      </button>
    </form>
  );
}