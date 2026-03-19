// app/actions.ts
import { createAction } from "valiact/core";
import { UserDTOSchema } from "@/schemas/user.schema"; // ไฟล์ที่ SAV เจนให้

export const registerUser = createAction(UserDTOSchema, async (data) => {
  // 'data.age' จะเป็น number แน่นอน 100% เพราะผ่านด่านหน้ามาแล้ว
  const user = await fakeUserRegistration(data.email, data.age, data.avatar);
  return user;
});

const fakeUserRegistration = async (
  email: string,
  age: number,
  avatar: File,
) => {
  // จำลองการลงทะเบียนผู้ใช้
  return {
    email,
    age,
    avatarUrl: URL.createObjectURL(avatar),
  };
};
