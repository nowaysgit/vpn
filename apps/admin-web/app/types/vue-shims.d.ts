declare module '*.vue' {
  const component: import('vue').DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
