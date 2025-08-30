export type CellMode = "upload" | "preset" | "preset+upload" | "youtube";
export type PresetItem = { label: string; url: string };

export type ColumnConfig = {
  title: string;
  mode: CellMode;
  presets?: PresetItem[];
  allowUpload?: boolean; // preset+upload에서만 사용
};

// 프리셋 라벨만 1..N (URL은 나중에 채우면 됨)
const mkPresets = (n: number): PresetItem[] =>
  Array.from({ length: n }, (_, i) => ({ label: String(i + 1), url: "" }));

export const COLUMN_CONFIGS: ColumnConfig[] = [
  { title: "셀카", mode: "upload" },
  { title: "남찍사", mode: "upload" },
  { title: "무대", mode: "youtube" }, // ← URL/ID만 입력 받아 썸네일로 변환
  {
    title: "모에화",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "토끼", url: "/public/assets/moe/rabbit.jpeg" },
      { label: "고양이", url: "/public/assets/moe/cat.jpeg" },
      { label: "돼햄이", url: "/public/assets/moe/애플이.jpeg" },
      { label: "강아지", url: "/public/assets/moe/puppy.jpeg" },
      { label: "오목눈이", url: "/public/assets/moe/오목눈이.jpeg" },
      { label: "녕숭이", url: "/public/assets/moe/원숭이.jpeg" },
      { label: "시나모롤", url: "/public/assets/moe/시나모롤.jpeg" },
    ],
  },
  {
    title: "작사곡",
    mode: "preset",
    presets: [
      { label: "DREAMLIKE", url: "/public/assets/written/dreamlike.png" },
      { label: "Mine", url: "/public/assets/written/mine.png" },
      { label: "Shine With Me", url: "/public/assets/written/shinewithme.png" },
      { label: "OTT", url: "/public/assets/written/OTT.png" },
      { label: "Blue Heart", url: "/public/assets/written/blueheart.png" },
      { label: "ATTITUDE", url: "/public/assets/written/attitude.png" },
      { label: "XOXZ", url: "/public/assets/written/xoxz.png" },
    ],
  },
  {
    title: "광고",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "이니스프리", url: "/public/assets/ad/innisfree.png" },
      { label: "Miu Miu", url: "/public/assets/ad/miumiu.jpg" },
      { label: "Hapa Kristin", url: "/public/assets/ad/hapa.jpg" },
      { label: "EIDER", url: "/public/assets/ad/eider.png" },
      { label: "AMUSE", url: "/public/assets/ad/amuse.jpg" },
      { label: "rolarola", url: "/public/assets/ad/rola.jpg" },
      { label: "KÉRASTASE", url: "/public/assets/ad/kerastase.jpg" },
      { label: "TOMMY JEANS", url: "/public/assets/ad/tommy.jpg" },
      { label: "우리은행", url: "/public/assets/ad/우리은행.jpg" },
      { label: "Malto", url: "/public/assets/ad/Malto.jpg" },
      { label: "DEEP & LOW", url: "/public/assets/ad/deep.png" },
      { label: "Dyson", url: "/public/assets/ad/dyson.jpeg" },
      { label: "데싱디바", url: "/public/assets/ad/ds.jpeg" },
      { label: "JIM BEAM", url: "/public/assets/ad/jimbeam.jpeg" },
      { label: "배러", url: "/public/assets/ad/better.jpeg" },
      { label: "다우니", url: "/public/assets/ad/downy.jpeg" },
      { label: "New Balance", url: "/public/assets/ad/nb.jpeg" },
      { label: "메디큐브 AGE-R", url: "/public/assets/ad/medi.jpeg" },
      { label: "BVLGARI", url: "/public/assets/ad/bvlgari.jpeg" },
    ],
  },
  {
    title: "앨범활동",
    mode: "preset",
    presets: [
      { label: "ELEVEN", url: "/public/assets/album/eleven-album.jpeg" },
      { label: "LOVE DIVE", url: "/public/assets/album/lovedive-album.jpeg" },
      { label: "After Like", url: "/public/assets/album/afterlike-album.jpeg" },
      { label: "I've IVE", url: "/public/assets/album/iveive-album.jpeg" },
      { label: "I'VE MINE", url: "/public/assets/album/ivemine-album.jpeg" },
      { label: "IVE SWITCH", url: "/public/assets/album/switch-album.jpeg" },
      { label: "IVE EMPATHY", url: "/public/assets/album/empathy-album.jpeg" },
      { label: "IVE SECRET", url: "/public/assets/album/secret-album.jpeg" },
    ],
  },
  {
    title: "챌린지",
    mode: "preset+upload",
    presets: [
      { label: "If we ever broke up", url: "/public/assets/tiktok/if.jpg" },
      { label: "OTT", url: "/public/assets/tiktok/ott.jpg" },
      { label: "뽀삐뽀", url: "/public/assets/tiktok/ppo.jpg" },
      { label: "Mua", url: "/public/assets/tiktok/mua.jpg" },
      { label: "pompom", url: "/public/assets/tiktok/pom.jpg" },
      { label: "Espresso", url: "/public/assets/tiktok/es.jpg" },
      { label: "사츠마이모", url: "/public/assets/tiktok/sats.jpg" },
    ],
    allowUpload: true,
  },
  {
    title: "예능",
    mode: "preset",
    presets: [
      { label: "차린건 없지만", url: "/public/assets/show/차없.jpeg" },
      { label: "피식쇼", url: "/public/assets/show/피식쇼.jpeg" },
      { label: "살롱드립2", url: "/public/assets/show/살롱드립.jpeg" },
      { label: "냉터뷰", url: "/public/assets/show/냉터뷰.jpeg" },
      { label: "냉장고를 부탁해", url: "/public/assets/show/냉부.jpeg" },
      { label: "유퀴즈", url: "/public/assets/show/유퀴즈.jpeg" },
      { label: "전과자", url: "/public/assets/show/전과자.jpeg" },
    ],
    allowUpload: true,
  },
  {
    title: "케미",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "안녕즈", url: "/public/assets/chemi/안녕즈.jpeg" },
      { label: "단장즈", url: "/public/assets/chemi/단장즈.jpeg" },
      { label: "공주즈", url: "/public/assets/chemi/공주즈.jpeg" },
      { label: "영리즈", url: "/public/assets/chemi/영리즈.jpeg" },
      { label: "인형즈", url: "/public/assets/chemi/인형즈.jpeg" },
    ],
  },
];
