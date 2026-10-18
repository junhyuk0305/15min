// 웹 개발 빌드에서 부를 때 필요한 CORS 헤더. 앱(네이티브)은 CORS를 보지 않는다.
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
