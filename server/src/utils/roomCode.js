const CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function createRoomCode(existingCodes) {
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join("");
  } while (existingCodes.has(code));

  return code;
}
