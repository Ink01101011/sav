// packages/sav-compiler/poc-compiler.ts
import { Project, InterfaceDeclaration } from "ts-morph";

const project = new Project();
const sourceFile = project.createSourceFile(
  "temp.ts",
  `
  interface CreateUserDTO {
    email: string;
    age: number;
    isAdmin: boolean;
  }
`,
);

function generateValibotSchema(node: InterfaceDeclaration) {
  const name = node.getName();
  let schemaCode = `const ${name}Schema = v.object({\n`;

  node.getProperties().forEach((prop) => {
    const type = prop.getType().getText();
    let vType = "v.string()"; // Default

    if (type === "number") vType = "v.number()";
    if (type === "boolean") vType = "v.boolean()";

    schemaCode += `  ${prop.getName()}: ${vType},\n`;
  });

  schemaCode += "});";
  return schemaCode;
}

const targetInterface = sourceFile.getInterfaceOrThrow("CreateUserDTO");
console.log("--- Generated Runtime Schema ---");
console.log(generateValibotSchema(targetInterface));
