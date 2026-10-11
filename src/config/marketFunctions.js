// src/config/marketFunctions.js

// Chat session state
let chatSession = null;

/**
 * Get the current chat session
 * @returns {Object} The current chat session
 */
export const getChatSession = () => chatSession;

/**
 * Set the current chat session
 * @param {Object} session - The chat session to set
 */
export const setChatSession = (session) => {
  chatSession = session;
};

// Empty array for function definitions since we're only using search
// This maintains compatibility with the rest of the codebase
export const marketFunctionDefinitions = [];
