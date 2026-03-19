interface AddressDTO {
  /** @sav minLength(5, "กรุณากรอกรายละเอียดที่อยู่") */
  street: string;
  city: string;
}

interface ExperienceDTO {
  company: string;
  /** @sav min(1, "ต้องทำงานมาอย่างน้อย 1 ปี") */
  years: number;
}

export interface JobApplicationDTO {
  /** @sav email("อีเมลไม่ถูกต้อง") */
  email: string;

  // Nested Object
  address: AddressDTO;

  // Nested Array
  experiences: ExperienceDTO[];
}
