export const formatTime = (timeString) => {
  if (!timeString) return "";

  // Se il tempo contiene già il formato corretto (con ' o ")
  if (timeString.includes('"')) {
    const matches = timeString.match(/(?:(\d+)')?(\d+)"(\d+)/);
    if (matches) {
      const [, minutes, seconds, decimal] = matches;
      // Se non ci sono minuti o sono zero, mostra solo secondi"decimi
      if (!minutes || minutes === "00" || parseInt(minutes) === 0) {
        return `${parseInt(seconds)}"${decimal}`;
      }
      return `${parseInt(minutes)}'${seconds}"${decimal}`;
    }
  }

  // Se il tempo è nel formato MM:SS:DD
  const [minutes, seconds, decimal] = timeString.split(":");
  if (!minutes || minutes === "00" || parseInt(minutes) === 0) {
    return `${parseInt(seconds)}"${decimal}`;
  }
  return `${parseInt(minutes)}'${seconds}"${decimal}`;
};

export const timeToMilliseconds = (timeFormatted) => {
  if (!timeFormatted) return Infinity;

  // Gestisce formato con apostrofo e virgolette (es: 1'11"11 o 11"11)
  const matches = timeFormatted.match(/(?:(\d+)')?(\d+)"(\d+)/);
  if (matches) {
    const [, minutes = "0", seconds, decimal] = matches;
    return (
      parseInt(minutes) * 60 * 100 +
      parseInt(seconds) * 100 +
      parseInt(decimal)
    );
  }

  // Gestisce formato con due punti (es: 00:11:11)
  const [minutes, seconds, decimal] = timeFormatted.split(":");
  if (minutes && seconds && decimal) {
    return (
      parseInt(minutes) * 60 * 100 +
      parseInt(seconds) * 100 +
      parseInt(decimal)
    );
  }

  return Infinity;
};