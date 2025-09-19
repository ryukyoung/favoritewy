// src/types/assets.d.ts
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.jpeg" {
  const src: string;
  export default src;
}
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.svg" {
  const src: string;
  export default src;
}

// (혹시 ?url 쿼리를 쓰게 될 경우를 대비)
declare module "*?url" {
  const src: string;
  export default src;
}
