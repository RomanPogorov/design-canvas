// The language of the design canvas UI (Speca's strings, Russian and English).
export default {
    type: "string",
    env: "DESIGN_CANVAS_LOCALE",
    default: "ru",
    options: ["auto", "ru", "en"],
    title: "Design canvas language",
    description: "Language of the design canvas UI: ru (default, as Speca shows it to its Russian-speaking people), en, or auto (the browser's language).",
};
