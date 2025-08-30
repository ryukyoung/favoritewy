export type Mode = "solo" | "multi";
export type ImgLike = string | File | null | undefined;

export type Participant = {
  nickname: string;
  images: (File | string | null)[]; // 길이 12 권장
};

export type RouteState = {
  mode: Mode;
  participants: Participant[];
  titles: string[]; // 길이 12
};
