import * as fs from "fs";

updateProgramPk("programs/monaco_protocol/src/lib.rs");
updateProgramPk("Anchor.toml");

export function updateProgramPk(filePath: string) {
  const releasePkString = "monacoUXKtUi6vKsQwaLyxmXKSievfNWEcYXTgkbCih";
  const edgePkString = "mpDEVnZKneBb4w1vQsoTgMkNqnFe1rwW8qjmf3NsrAU";

  // Read the file
  const content = fs.readFileSync(filePath, "utf8");

  const updatedContent = content.replace(
    new RegExp(releasePkString, "g"),
    edgePkString,
  );

  fs.writeFileSync(filePath, updatedContent);
}
