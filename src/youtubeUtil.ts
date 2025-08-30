// youtubeUtil.ts
export const getYoutubeId = (input: string): string | null => {
  // URL이든 ID든 최대한 뽑아내기
  try {
    // 만약 그냥 ID만 들어오면 아래 URL 파싱에서 에러 -> catch에서 ID 유사 체크
    const u = new URL(input);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1) || null;
    }
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return id;
      const paths = u.pathname.split("/");
      const idx = paths.indexOf("shorts");
      if (idx !== -1 && paths[idx + 1]) return paths[idx + 1];
    }
  } catch {
    // 그냥 문자열일 때 ID 형태면 통과
    if (/^[a-zA-Z0-9_-]{6,}$/.test(input)) return input;
  }
  return null;
};

export const getYoutubeThumb = (videoId: string, quality: "hq" | "mq" = "hq") =>
  `https://i.ytimg.com/vi/${videoId}/${quality}default.jpg`;
