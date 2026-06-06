import { render } from './render';
import { setupClick, setupKeyboard } from './events';
import { initAddCard } from './addcard';
import { initEditCard } from './editcard';

initAddCard();
initEditCard();
setupClick();
setupKeyboard();
render();
