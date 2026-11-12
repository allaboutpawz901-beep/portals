import styles from './Toast.module.css';

interface ToastProps {
  message: string;
  visible: boolean;
}

export default function Toast({ message, visible }: ToastProps) {
  return (
    <div id="toast" className={`${styles.toast} ${visible ? styles.show : ''}`}>
      {message}
    </div>
  );
}
