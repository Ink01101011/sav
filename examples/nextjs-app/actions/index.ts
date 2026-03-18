// app/actions.ts
import { createAction } from 'sav-core';
import { UserDTOSchema } from './schemas.gen'; // ไฟล์ที่ SAV เจนให้

export const registerUser = createAction(UserDTOSchema, async (data) => {
  // 'data.age' จะเป็น number แน่นอน 100% เพราะผ่านด่านหน้ามาแล้ว
  const user = await db.user.create({ 
    data: {
      email: data.email,
      age: data.age, // ไม่ต้องครอบ Number(data.age) เองแล้ว!
      avatarUrl: await uploadToS3(data.avatar) // data.avatar คือ File object
    }
  });
  return user;
});