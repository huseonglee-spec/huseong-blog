# huseong.com

이후성의 생각과 경험을 게시하는 정적 블로그입니다.

## 글 게시

`src/content/posts/`에 Markdown 또는 MDX 파일을 추가합니다.

```md
---
title: "글 제목"
subtitle: "선택 사항"
publishedAt: 2026-07-13
thumbnail: "/images/thumbnail.jpg"
thumbnailAlt: "이미지 설명"
---

본문
```

- `subtitle`, `thumbnail`, `thumbnailAlt`는 선택 사항입니다.
- 초안은 frontmatter에 `draft: true`를 추가합니다.
- 모든 공개 글은 날짜 역순으로 본문 전체가 피드에 표시됩니다.
- 제목은 `/posts/<파일명>/` 고유 URL로 연결됩니다.

## Rich Text

일반 Markdown으로 문단, `#`/`##`/`###` 제목, 강조, 링크, 이미지, 인용을 작성합니다. 제목이 있으면 목차가 자동 생성됩니다.

YouTube와 일반 동영상은 `.mdx` 글에서 컴포넌트를 사용합니다.

```mdx
import YouTube from "../../components/YouTube.astro";
import Video from "../../components/Video.astro";

<YouTube id="YOUTUBE_VIDEO_ID" title="동영상 제목" />
<Video src="/videos/example.mp4" title="동영상 제목" />
```

이미지와 동영상 파일은 각각 `public/images/`, `public/videos/`에 둡니다.

## 검증

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

`main` 브랜치에 push하면 GitHub Pages 배포 워크플로가 실행됩니다.
