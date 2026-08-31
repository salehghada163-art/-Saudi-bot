export const DIALECT_NAMES = {
  qassimi: "القصيمية",
  jeddawi: "الجداوية",
  southern: "الجنوبية",
  eastern: "الشرقية",
};

export function getVoiceSelection() {
  return {
    gender: sessionStorage.getItem("saudiVoiceGender"),
    dialect: sessionStorage.getItem("saudiVoiceDialect"),
  };
}

export function selectionIsValid({ gender, dialect }) {
  return ["male", "female"].includes(gender) && Object.hasOwn(DIALECT_NAMES, dialect);
}
