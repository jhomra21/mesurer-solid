type IconProps = {
  size?: number;
  class?: string;
};

const IconBase = (props: IconProps & { children: any }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={props.size ?? 24}
    height={props.size ?? 24}
    viewBox="0 0 256 256"
    fill="currentColor"
    aria-hidden="true"
    class={props.class}
    onDragStart={(event) => event.preventDefault()}
  >
    {props.children}
  </svg>
);

export const CursorIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path d="M166.59,134.1a1.91,1.91,0,0,1-.55-1.79,2,2,0,0,1,1.08-1.42l46.25-17.76.24-.1A14,14,0,0,0,212.38,87L52.29,34.7A13.95,13.95,0,0,0,34.7,52.29L87,212.38a13.82,13.82,0,0,0,12.6,9.6c.23,0,.46,0,.69,0A13.84,13.84,0,0,0,113,213.61a2.44,2.44,0,0,0,.1-.24l17.76-46.25a2,2,0,0,1,3.21-.53l51.31,51.31a14,14,0,0,0,19.8,0l12.69-12.69a14,14,0,0,0,0-19.8Zm42.82,62.63-12.68,12.68a2,2,0,0,1-2.83,0L142.59,158.1a14,14,0,0,0-22.74,4.32,2.44,2.44,0,0,0-.1.24L102,208.91a2,2,0,0,1-3.61-.26L46.11,48.57a1.87,1.87,0,0,1,.47-2A1.92,1.92,0,0,1,47.93,46a2.22,2.22,0,0,1,.64.1L208.65,98.38a2,2,0,0,1,.26,3.61l-46.25,17.76-.24.1a14,14,0,0,0-4.32,22.74h0l51.31,51.31A2,2,0,0,1,209.41,196.73Z" />
  </IconBase>
);

export const RulerIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path d="M233.91,74.79,181.22,22.1a14,14,0,0,0-19.8,0L22.09,161.41a14,14,0,0,0,0,19.8L74.78,233.9a14,14,0,0,0,19.8,0L233.91,94.59A14,14,0,0,0,233.91,74.79ZM225.42,86.1,86.1,225.41h0a2,2,0,0,1-2.83,0L30.58,172.73a2,2,0,0,1,0-2.83L64,136.48l27.76,27.76a6,6,0,1,0,8.48-8.48L72.48,128,96,104.48l27.76,27.76a6,6,0,0,0,8.48-8.48L104.48,96,128,72.49l27.76,27.75a6,6,0,0,0,8.48-8.48L136.49,64,169.9,30.59a2,2,0,0,1,2.83,0l52.69,52.68A2,2,0,0,1,225.42,86.1Z" />
  </IconBase>
);

export const XrayIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="12" stroke-opacity="0.78" d="M76 48h96a16 16 0 0 1 16 16v96a16 16 0 0 1-16 16H76a16 16 0 0 1-16-16V64a16 16 0 0 1 16-16Zm32 32h96a16 16 0 0 1 16 16v96a16 16 0 0 1-16 16h-96a16 16 0 0 1-16-16V96a16 16 0 0 1 16-16Z" />
  </IconBase>
);

export const RulersIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="12" d="M48 208V48h160M80 48v24m32-24v24m32-24v24m32-24v24M48 80h24M48 112h24m-24 32h24m-24 32h24" />
  </IconBase>
);

export const CaretDownIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 8} class={props.class}>
    <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
  </IconBase>
);

export const CheckIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 12} class={props.class}>
    <path d="M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z" />
  </IconBase>
);

export const MinusIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 12} class={props.class}>
    <path d="M228,128a12,12,0,0,1-12,12H40a12,12,0,0,1,0-24H216A12,12,0,0,1,228,128Z" />
  </IconBase>
);

export const TextInspectorIcon = (props: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" class={props.class} onDragStart={(event) => event.preventDefault()}>
    <text x="50%" y="60%" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" font-weight="300" font-size="220">Aa</text>
  </svg>
);

export const ColorPickerIcon = (props: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24" fill="none" aria-hidden="true" class={props.class}>
    <path fill="currentColor" fill-rule="evenodd" transform="translate(-1.44 -1.44) scale(1.12)" d="M15.16 5.658a2.25 2.25 0 0 1 3.18.001l.155.17a2.25 2.25 0 0 1 0 2.84l-.154.172-1.696 1.692a1.5 1.5 0 0 1 .02 1.913l-.104.114a1.5 1.5 0 0 1-2.007.103l-.02-.018-4.443 4.447a2.24 2.24 0 0 1-1.716.65l-.814.815a1.5 1.5 0 0 1-2.121-2.121l.816-.818a2.25 2.25 0 0 1 .653-1.708l4.443-4.446a1.5 1.5 0 0 1 .088-2.025l.114-.103a1.5 1.5 0 0 1 1.91.015zm-7.544 8.959a1.25 1.25 0 0 0-.358 1.021c.021.197-.014.406-.154.546l-.958.96a.5.5 0 0 0 .708.706l.955-.956c.14-.14.352-.176.55-.153.364.042.745-.077 1.025-.356l4.438-4.442-1.767-1.767zm10.018-8.251a1.25 1.25 0 0 0-1.768 0l-1.782 1.78-.065.06a.87.87 0 0 1-1.165-.06.5.5 0 0 0-.707.707l3 3a.5.5 0 0 0 .628.064l.079-.064a.5.5 0 0 0 0-.707l-.004-.004a.873.873 0 0 1 .004-1.23l1.78-1.778a1.25 1.25 0 0 0 0-1.768" clip-rule="evenodd" />
  </svg>
);

export const GearIcon = (props: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={props.size ?? 20} height={props.size ?? 20} viewBox="0 0 24 24" fill="none" aria-hidden="true" class={props.class}>
    <path d="M10.6504 5.81117C10.9939 4.39628 13.0061 4.39628 13.3496 5.81117C13.5715 6.72517 14.6187 7.15891 15.4219 6.66952C16.6652 5.91193 18.0881 7.33479 17.3305 8.57815C16.8411 9.38134 17.2748 10.4285 18.1888 10.6504C19.6037 10.9939 19.6037 13.0061 18.1888 13.3496C17.2748 13.5715 16.8411 14.6187 17.3305 15.4219C18.0881 16.6652 16.6652 18.0881 15.4219 17.3305C14.6187 16.8411 13.5715 17.2748 13.3496 18.1888C13.0061 19.6037 10.9939 19.6037 10.6504 18.1888C10.4285 17.2748 9.38135 16.8411 8.57815 17.3305C7.33479 18.0881 5.91193 16.6652 6.66952 15.4219C7.15891 14.6187 6.72517 13.5715 5.81117 13.3496C4.39628 13.0061 4.39628 10.9939 5.81117 10.6504C6.72517 10.4285 7.15891 9.38134 6.66952 8.57815C5.91193 7.33479 7.33479 5.91192 8.57815 6.66952C9.38135 7.15891 10.4285 6.72517 10.6504 5.81117Z" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1" />
  </svg>
);

export const CopyIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
  </IconBase>
);

export const CopySelectionIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path d="M152,40a8,8,0,0,1-8,8H112a8,8,0,0,1,0-16h32A8,8,0,0,1,152,40Zm-8,168H112a8,8,0,0,0,0,16h32a8,8,0,0,0,0-16ZM208,32H184a8,8,0,0,0,0,16h24V72a8,8,0,0,0,16,0V48A16,16,0,0,0,208,32Zm8,72a8,8,0,0,0-8,8v32a8,8,0,0,0,16,0V112A8,8,0,0,0,216,104Zm0,72a8,8,0,0,0-8,8v24H184a8,8,0,0,0,0,16h24a16,16,0,0,0,16-16V184A8,8,0,0,0,216,176ZM40,152a8,8,0,0,0,8-8V112a8,8,0,0,0-16,0v32A8,8,0,0,0,40,152Zm32,56H48V184a8,8,0,0,0-16,0v24a16,16,0,0,0,16,16H72a8,8,0,0,0,0-16ZM72,32H48A16,16,0,0,0,32,48V72a8,8,0,0,0,16,0V48H72a8,8,0,0,0,0-16Z" />
  </IconBase>
);

export const NoteIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path d="M229.66,58.34l-32-32a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,88,128v32a8,8,0,0,0,8,8h32a8,8,0,0,0,5.66-2.34l96-96A8,8,0,0,0,229.66,58.34ZM124.69,152H104V131.31l64-64L188.69,88ZM200,76.69,179.31,56,192,43.31,212.69,64ZM224,128v80a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V48A16,16,0,0,1,48,32h80a8,8,0,0,1,0,16H48V208H208V128a8,8,0,0,1,16,0Z" />
  </IconBase>
);

export const SendIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 20} class={props.class}>
    <path d="M231.87,114l-168-95.89A16,16,0,0,0,40.92,37.34L71.55,128,40.92,218.67A16,16,0,0,0,56,240a16.15,16.15,0,0,0,7.93-2.1l167.92-96.05a16,16,0,0,0,.05-27.89ZM56,224a.56.56,0,0,0,0-.12L85.74,136H144a8,8,0,0,0,0-16H85.74L56.06,32.16A.46.46,0,0,0,56,32l168,95.83Z" />
  </IconBase>
);

export const TrashIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 18} class={props.class}>
    <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
  </IconBase>
);

export const CloseIcon = (props: IconProps) => (
  <IconBase size={props.size ?? 18} class={props.class}>
    <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
  </IconBase>
);
