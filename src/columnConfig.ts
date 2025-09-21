export type CellMode = "upload" | "preset" | "preset+upload" | "youtube";
export type PresetItem = { label: string; url: string };

export type ColumnConfig = {
  title: string;
  mode: CellMode;
  presets?: PresetItem[];
  allowUpload?: boolean; // preset+upload에서만 사용
};

export const COLUMN_CONFIGS: ColumnConfig[] = [
  { title: "셀카", mode: "upload" },
  { title: "남찍사", mode: "upload" },
  { title: "무대", mode: "youtube" }, // ← URL/ID만 입력 받아 썸네일로 변환
  {
    title: "모에화",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "토끼", url: "../assets/moe/rabbit.jpeg" },
      { label: "고양이", url: "../assets/moe/cat.jpg" },
      { label: "돼햄이", url: "../assets/moe/애플이.jpeg" },
      { label: "강아지", url: "../assets/moe/puppy.jpeg" },
      { label: "오목눈이", url: "../assets/moe/오목눈이.jpeg" },
      { label: "녕숭이", url: "../assets/moe/원숭이.jpeg" },
      { label: "시나모롤", url: "../assets/moe/시나모롤.jpeg" },
    ],
  },
  {
    title: "작사곡",
    mode: "preset",
    presets: [
      { label: "DREAMLIKE", url: "../assets/written/dreamlike.png" },
      { label: "Mine", url: "../assets/written/mine.png" },
      { label: "Shine With Me", url: "../assets/written/shinewithme.png" },
      { label: "OTT", url: "../assets/written/OTT.png" },
      { label: "Blue Heart", url: "../assets/written/blueheart.png" },
      { label: "ATTITUDE", url: "../assets/written/attitude.png" },
      { label: "XOXZ", url: "../assets/written/xoxz.png" },
    ],
  },
  {
    title: "광고",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "이니스프리", url: "../assets/ad/innisfree.png" },
      { label: "Miu Miu", url: "../assets/ad/miumiu.jpg" },
      { label: "Hapa Kristin", url: "../assets/ad/hapa.jpg" },
      { label: "EIDER", url: "../assets/ad/eider.png" },
      { label: "AMUSE", url: "../assets/ad/amuse.jpg" },
      { label: "rolarola", url: "../assets/ad/rola.jpg" },
      { label: "KÉRASTASE", url: "../assets/ad/kerastase.jpg" },
      { label: "TOMMY JEANS", url: "../assets/ad/tommy.jpeg" },
      { label: "우리은행", url: "../assets/ad/우리은행.jpeg" },
      { label: "Malto", url: "../assets/ad/Malto.jpg" },
      { label: "DEEP & LOW", url: "../assets/ad/deep.png" },
      { label: "Dyson", url: "../assets/ad/dyson.jpeg" },
      { label: "데싱디바", url: "../assets/ad/ds.jpeg" },
      { label: "JIM BEAM", url: "../assets/ad/jimbeam.jpeg" },
      { label: "배러", url: "../assets/ad/better.jpeg" },
      { label: "다우니", url: "../assets/ad/downy.jpeg" },
      { label: "New Balance", url: "../assets/ad/nb.jpeg" },
      { label: "메디큐브 AGE-R", url: "../assets/ad/medi.jpeg" },
      { label: "BVLGARI", url: "../assets/ad/bvlgari.jpeg" },
    ],
  },
  {
    title: "앨범활동",
    mode: "preset",
    presets: [
      { label: "ELEVEN", url: "../assets/album/eleven-album.jpeg" },
      { label: "LOVE DIVE", url: "../assets/album/lovedive-album.jpg" },
      { label: "After Like", url: "../assets/album/afterlike-album.jpg" },
      { label: "I've IVE", url: "../assets/album/iveive-album.jpeg" },
      { label: "I'VE MINE", url: "../assets/album/ivemine-album.jpeg" },
      { label: "IVE SWITCH", url: "../assets/album/switch-album.jpeg" },
      { label: "IVE EMPATHY", url: "../assets/album/empathy-album.png" },
      { label: "IVE SECRET", url: "../assets/album/secret-album.jpeg" },
    ],
  },
  {
    title: "챌린지",
    mode: "preset+upload",
    presets: [
      { label: "If we ever broke up", url: "../assets/tiktok/if.jpg" },
      { label: "OTT", url: "../assets/tiktok/ott.jpg" },
      { label: "뽀삐뽀", url: "../assets/tiktok/bbo.jpg" },
      { label: "Mua", url: "../assets/tiktok/mua.jpg" },
      { label: "pompom", url: "../assets/tiktok/pom.jpg" },
      { label: "Espresso", url: "../assets/tiktok/es.jpg" },
      { label: "사츠마이모", url: "../assets/tiktok/sats.JPG" },
    ],
    allowUpload: true,
  },
  {
    title: "예능",
    mode: "preset",
    presets: [
      { label: "차린건 없지만", url: "../assets/show/차없.jpeg" },
      { label: "피식쇼", url: "../assets/show/피식쇼.jpeg" },
      { label: "살롱드립2", url: "../assets/show/살롱드립.jpeg" },
      { label: "냉터뷰", url: "../assets/show/냉터뷰.jpeg" },
      { label: "냉장고를 부탁해", url: "../assets/show/냉부.jpeg" },
      { label: "유퀴즈", url: "../assets/show/유퀴즈.jpeg" },
      { label: "전과자", url: "../assets/show/전과자.jpeg" },
      {
        label: "걍밍경\n(브이로그)",
        url: "../assets/show/브이로그.jpeg",
      },
      {
        label: "추성훈\n(미녀와 마초)",
        url: "../assets/show/미녀.jpeg",
      },
    ],
    allowUpload: true,
  },
  {
    title: "라이브방송",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "241011", url: "../assets/live/y1.png" },
      { label: "241025", url: "../assets/live/bb1.png" },
      { label: "250614", url: "../assets/live/b1.png" },
      { label: "250726", url: "../assets/live/b2.png" },
      { label: "250921", url: "../assets/live/b3.png" },
    ],
  },
  {
    title: "케미",
    mode: "preset+upload",
    allowUpload: true,
    presets: [
      { label: "안녕즈", url: "../assets/chemi/안녕즈.jpeg" },
      { label: "단장즈", url: "../assets/chemi/단장즈.jpeg" },
      { label: "공주즈", url: "../assets/chemi/공주즈.jpeg" },
      { label: "영리즈", url: "../assets/chemi/영리즈.jpeg" },
      { label: "인형즈", url: "../assets/chemi/인형즈.jpeg" },
    ],
  },
];
