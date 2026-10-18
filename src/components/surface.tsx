import { createContext, useContext, type ReactNode } from 'react';
import { PALETTES, type Palette, type ThemeName } from '@/lib/theme';

/** 지금 그리는 바탕. Screen이 정하고 안쪽 부품이 읽는다 */
export type Surface = {
  theme: ThemeName;
  p: Palette;
  /** 빨강 바탕(독촉, 이탈, 포기). 글자와 버튼이 흰색으로 바뀐다 */
  red: boolean;
};

const Ctx = createContext<Surface>({ theme: 'ivory', p: PALETTES.ivory, red: false });

export function SurfaceProvider({ theme = 'ivory', red = false, children }: { theme?: ThemeName; red?: boolean; children: ReactNode }) {
  return <Ctx.Provider value={{ theme, p: PALETTES[theme], red }}>{children}</Ctx.Provider>;
}

export function useSurface(): Surface {
  return useContext(Ctx);
}

/** 바탕에 맞는 글자색. inverse를 직접 주면 그 값을 따른다 */
export function useInk(inverse?: boolean) {
  const { p, red } = useSurface();
  const inv = inverse ?? red;
  return {
    p,
    inv,
    ink: inv ? p.onRed : p.ink,
    sub: inv ? p.onRed : p.sub,
    /** 바탕 위 빨강 글자. 빨강 바탕에서는 흰색 */
    alert: inv ? p.onRed : p.redText,
  };
}
