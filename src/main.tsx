import { render } from 'preact';
import { App } from './app/App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден корневой элемент #root');
render(<App />, root);
