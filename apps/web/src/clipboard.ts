/**
 * Kopiowanie tekstu do schowka - dwoma drogami.
 *
 * Nowoczesne `navigator.clipboard` wymaga bezpiecznego polaczenia i zgody,
 * a odmawia takze wtedy, gdy okno nie ma w danej chwili skupienia. Starsze
 * `execCommand` nie potrzebuje niczego z tych rzeczy, wiec zostaje jako zapas.
 *
 * Uzywaja tego dwa miejsca: przycisk „Udostepnij" w pasku narzedzi i podglad
 * kodu bez komentarzy w edytorze.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // spróbujemy starszą drogą
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    const copied = document.execCommand('copy')
    area.remove()
    return copied
  } catch {
    return false
  }
}
