export interface CustomerInfoDTO {
  username: string;
  fullName: string;
  firstName: string;
  lastName: string;
  isExistingCustomer: boolean;
  avatar: File;
  address: CustomerAddressDTO;
  contact: CustomerContactDTO;
}

export interface CustomerContactDTO {
  email: Array<string>;
  phoneNumbers: string[];
}

export interface CustomerAddressDTO {
  street: string;
  city: string;
  postalCode: string;
  building?: string;
}
