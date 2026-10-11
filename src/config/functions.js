// Web search is now handled server-side in Cloud Functions.
// This file only exports the Gemini function schema (used if needed client-side).

export const searchWebDefinition = {
  name: "searchWeb",
  description: "Search for real-time news or market information. Use for headlines, market updates, or today's events.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query to look up online",
      },
    },
    required: ["query"],
  },
};

// No longer used client-side — search happens in the chat Cloud Function
export const searchWebSmart = async ({ query }) => {
  return "Search is handled server-side.";
};
