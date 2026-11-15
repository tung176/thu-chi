// Hộp báo lỗi toàn cục được khai báo trong index.html.
interface Window {
  __fatal?: (title: string, err: unknown) => void
}
