const handleTextToSpeech = async (text) => {
  try {
    const audioBlob = await textToSpeech(text);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    audio.play();
  } catch (error) {
    console.error("Error playing audio:", error);
  }
}; 