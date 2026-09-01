/*
  Wlaczenie IZOLACJI MIEDZY ZRODLAMI na serwerze, ktory nie pozwala ustawic naglowkow.

  DO CZEGO TO POTRZEBNE
  Skrypt Pythona z laboratorium czeka na ramke z plytki i na wpisana liczbe -
  czeka NAPRAWDE, czyli zatrzymuje sie w miejscu, tak jak na prawdziwym komputerze.
  Zeby dalo sie zatrzymac watek roboczy i obudzic go z zewnatrz, przegladarka musi
  udostepnic `SharedArrayBuffer`. A ten wlacza sie dopiero wtedy, gdy strona
  przyjdzie z dwoma naglowkami:

      Cross-Origin-Opener-Policy:  same-origin
      Cross-Origin-Embedder-Policy: require-corp

  Serwer deweloperski Vite ustawia je sam (patrz vite.config.ts). Ale gotowa
  aplikacja ma stac na zwyklym hostingu plikow statycznych - takim jak GitHub
  Pages - gdzie naglowkow nie da sie ustawic w ogole.

  JAK TO OBCHODZIMY
  Robotnik uslugowy (service worker) siedzi miedzy strona a siecia i moze
  DOPISAC te naglowki do kazdej odpowiedzi, zanim trafi ona do przegladarki.
  Przy pierwszej wizycie robotnik jeszcze nie dziala, wiec po jego instalacji
  przeladowujemy strone raz - od tej pory izolacja jest wlaczona.

  CZEGO TO KOSZTUJE
  Przy wlaczonej izolacji przegladarka odrzuca zasoby z innych adresow, ktore
  same nie zadeklaruja zgody. Cala aplikacja jest samowystarczalna (edytor,
  kompilator i Pyodide leza obok niej), a jedyny wyjatek - lokalny serwer
  kompilacji na porcie 5174 - odsyla naglowek `Cross-Origin-Resource-Policy`.
*/

if (typeof self !== 'undefined' && 'serviceWorker' in (self.navigator ?? {})) {
  // --- czesc uruchamiana na STRONIE ---------------------------------------
  // Znacznik jednorazowy. Gdyby robotnik z jakiegos powodu nie dodal naglowkow,
  // bez niego strona przeladowywalaby sie w kolko - a to gorsze niz brak Pythona.
  const PROBA = 'zl3avr.coi.proba'

  if (self.crossOriginIsolated) {
    sessionStorage.removeItem(PROBA)
  } else if (!sessionStorage.getItem(PROBA)) {
    // Robotnik przejmuje biezaca strone dzieki `clients.claim()`, ale naglowki
    // trafily juz do przegladarki - trzeba wczytac strone jeszcze raz.
    // Sygnalem, ze wlasnie przejal, jest zdarzenie `controllerchange`.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      sessionStorage.setItem(PROBA, '1')
      self.location.reload()
    })
    navigator.serviceWorker
      .register(self.document.currentScript.src)
      .then((registration) => {
        // Robotnik moze juz dzialac z poprzedniej wizyty - wtedy `controllerchange`
        // nie przyjdzie, bo nie ma czego zmieniac.
        if (registration.active && navigator.serviceWorker.controller) {
          sessionStorage.setItem(PROBA, '1')
          self.location.reload()
        }
      })
      .catch(() => {
        // Brak zgody albo brak obslugi robotnikow. Aplikacja dziala dalej -
        // zakladka „Komputer PC” powie wprost, czego brakuje.
      })
  }
} else {
  // --- czesc uruchamiana W ROBOTNIKU --------------------------------------
  self.addEventListener('install', () => self.skipWaiting())
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

  self.addEventListener('fetch', (event) => {
    const request = event.request
    // Zadania spoza naszego adresu i te bez zwyklego pobrania zostawiamy w spokoju.
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return

    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 0) return response
          const headers = new Headers(response.headers)
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp')
          headers.set('Cross-Origin-Opener-Policy', 'same-origin')
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          })
        })
        .catch((error) => new Response(String(error), { status: 502 })),
    )
  })
}
