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

## 배포

Vercel의 `huseongs-projects/huseong-com` 프로젝트가 `huseong.com`을 제공합니다. 현재 Vercel GitHub App은 이 저장소에 연결되어 있지 않으므로, 글을 추가한 뒤 CLI에서 검증·push·production deploy를 수행합니다.

최초 연결 또는 새 환경:

```bash
npx vercel@55.0.0 link --yes --project huseong-com --scope huseongs-projects
npx vercel@55.0.0 pull --yes --environment=production --scope huseongs-projects
```

게시:

```bash
pnpm test
pnpm build
git add .
git commit -m "Add post: 글 제목"
git push
npx vercel@55.0.0 build --prod --scope huseongs-projects
npx vercel@55.0.0 deploy --prebuilt --prod --yes --scope huseongs-projects
```

배포 후 `https://huseong.com/`과 해당 글의 고유 URL에서 실제 응답을 확인합니다.
