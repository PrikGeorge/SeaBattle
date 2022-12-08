;(function () {
    'use strict';
    /*
    0 - пустое место
    1 - палуба корабля
    2 - клетка рядом с кораблём
    3 - обстрелянная клетка
    4 - попадание в палубу
    */

    // флаг начала игры, устанавливается после нажатия кнопки 'Play' и запрещает
    // редактирование положения кораблей
    let startGame = false;
    // флаг установки обработчиков событий ручного размещения кораблей и
    // редактирование их положения
    let isHandlerPlacement = false;
    // флаг установки обработчиков событий ведения морского боя
    let isHandlerController = false;
    // флаг, блокирующий действия игрока во время выстрела компьютера
    let compShot = false;

    // получаем объект элемента DOM по его ID
    const getElement = id => document.getElementById(id);
    // вычисляем координаты всех сторон элемента относительно окна браузера
    // с учётом прокрутки страницы
    const getCoordinates = el => {
        const coords = el.getBoundingClientRect();
        return {
            left: coords.left + window.pageXOffset,
            right: coords.right + window.pageXOffset,
            top: coords.top + window.pageYOffset,
            bottom: coords.bottom + window.pageYOffset
        };
    };

    // игровое поле игрока
    const humanfield = getElement('field_human');
    // игровое поле компьютера
    const computerfield = getElement('field_computer');

    class Field {
        // размер стороны игрового поля в px
        static FIELD_SIDE = 539;
        static SHIP_SIDE = 36;

        // static FIELD_SIZE = 15;
        // static SHIPS_SIZE = 24;
        static FIELD_SIZE = 4;
        static SHIPS_SIZE = 2;

        // объект с данными кораблей
        // ключём будет являться тип корабля, а значением - массив,
        // первый элемент которого указывает кол-во кораблей данного типа,
        // второй элемент указывает кол-во палуб у корабля данного типа
        static SHIP_DATA = {
            fourdeck: [2, 4],
            // tripledeck: [5, 3],
            // doubledeck: [7, 2],
            // singledeck: [9, 1]
        };

        constructor(field) {
            // объект игрового поля, полученный в качестве аргумента
            this.field = field;
            // создаём пустой объект, куда будем заносить данные по каждому созданному кораблю
            // эскадры, подробно эти данные рассмотрим при создании объектов кораблей
            this.squadron = {};
            // двумерный массив, в который заносятся координаты кораблей, а в ходе морского
            // боя, координаты попаданий, промахов и заведомо пустых клеток
            this.matrix = [];
            // получаем координаты всех четырёх сторон рамки игрового поля относительно начала
            // document, с учётом возможной прокрутки по вертикали
            let {left, right, top, bottom} = getCoordinates(this.field);
            this.fieldLeft = left;
            this.fieldTop = top;
        }

        static createMatrix() {
            return [...Array(Field.FIELD_SIZE)].map(() => Array(Field.FIELD_SIZE).fill(0));
        }

        // n - максимальное значение, которое хотим получить
        static getRandom = n => Math.floor(Math.random() * (n + 1));

        cleanField() {
            while (this.field.firstChild) {
                this.field.removeChild(this.field.firstChild);
            }
            this.squadron = {};
            this.matrix = Field.createMatrix();
        }

        randomLocationShips() {
            for (let type in Field.SHIP_DATA) {
                // кол-во кораблей данного типа
                let count = Field.SHIP_DATA[type][0];
                // кол-во палуб у корабля данного типа
                let decks = Field.SHIP_DATA[type][1];
                // прокручиваем кол-во кораблей
                for (let i = 0; i < count; i++) {
                    // получаем координаты первой палубы и направление расположения палуб (корабля)
                    let options = this.getCoordsDecks(decks);
                    // кол-во палуб
                    options.decks = decks;
                    // имя корабля, понадобится в дальнейшем для его идентификации
                    options.shipname = type + String(i + 1);
                    // создаём экземпляр корабля со свойствами, указанными в
                    // объекте options с помощью класса Ship
                    const ship = new Ships(this, options);
                    ship.createShip();
                }
            }
        }

        getCoordsDecks(decks) {
            // получаем коэффициенты определяющие направление расположения корабля
            // kx===0 и ky===1 — корабль расположен горизонтально,
            // kx===1 и ky===0 - вертикально.
            let kx = Field.getRandom(1), ky = (kx === 0) ? 1 : 0,
                x, y;

            // в зависимости от направления расположения, генерируем
            // начальные координаты
            if (kx === 0) {
                x = Field.getRandom(Field.FIELD_SIZE - 1);
                y = Field.getRandom(Field.FIELD_SIZE - decks);
            } else {
                x = Field.getRandom(Field.FIELD_SIZE - decks);
                y = Field.getRandom(Field.FIELD_SIZE - 1);
            }

            const obj = {x, y, kx, ky}
            // проверяем валидность координат всех палуб корабля
            const result = this.checkLocationShip(obj, decks);
            // если координаты невалидны, снова запускаем функцию
            if (!result) return this.getCoordsDecks(decks);
            return obj;
        }

        checkLocationShip(obj, decks) {
            let {x, y, kx, ky, fromX, toX, fromY, toY} = obj;

            // формируем индексы, ограничивающие двумерный массив по оси X (строки)
            // если координата 'x' равна нулю, то это значит, что палуба расположена в самой
            // верхней строке, т. е. примыкает к верхней границе и началом цикла будет строка
            // с индексом 0, в противном случае, нужно начать проверку со строки с индексом
            // на единицу меньшим, чем у исходной, т.е. находящейся выше исходной строки
            fromX = (x === 0) ? x : x - 1;
            // если условие истинно - это значит, что корабль расположен вертикально и его
            // последняя палуба примыкает к нижней границе игрового поля
            // поэтому координата 'x' последней палубы будет индексом конца цикла
            if (x + kx * decks === Field.FIELD_SIZE && kx === 1) toX = x + kx * decks;
                // корабль расположен вертикально и между ним и нижней границей игрового поля
                // есть, как минимум, ещё одна строка, координата этой строки и будет
            // индексом конца цикла
            else if (x + kx * decks < Field.FIELD_SIZE && kx === 1) toX = x + kx * decks + 1;
            // корабль расположен горизонтально вдоль нижней границы игрового поля
            else if (x === Field.FIELD_SIZE - 1 && kx === 0) toX = x + 1;
            // корабль расположен горизонтально где-то по середине игрового поля
            else if (x < Field.FIELD_SIZE - 1 && kx === 0) toX = x + 2;

            // формируем индексы начала и конца выборки по столбцам
            // принцип такой же, как и для строк
            fromY = (y === 0) ? y : y - 1;
            if (y + ky * decks === Field.FIELD_SIZE && ky === 1) toY = y + ky * decks;
            else if (y + ky * decks < Field.FIELD_SIZE && ky === 1) toY = y + ky * decks + 1;
            else if (y === Field.FIELD_SIZE - 1 && ky === 0) toY = y + 1;
            else if (y < Field.FIELD_SIZE - 1 && ky === 0) toY = y + 2;

            if (toX === undefined || toY === undefined) return false;

            // отфильтровываем ячейки, получившегося двумерного массива,
            // содержащие 1, если такие ячейки существуют - возвращаем false
            return this.matrix.slice(fromX, toX)
                .filter(arr => arr.slice(fromY, toY).includes(1))
                .length <= 0;

        }
    }

    ///////////////////////////////////////////

    class Ships {
        constructor(self, {x, y, kx, ky, decks, shipname}) {
            // с каким экземпляром работаем
            this.player = (self === human) ? human : computer;
            // this.player = self;
            // на каком поле создаётся данный корабль
            this.field = self.field;
            // уникальное имя корабля
            this.shipname = shipname;
            //количество палуб
            this.decks = decks;
            // координата X первой палубы
            this.x = x;
            // координата Y первой палубы
            this.y = y;
            // направлении расположения палуб
            this.kx = kx;
            this.ky = ky;
            // счётчик попаданий
            this.hits = 0;
            // массив с координатами палуб корабля, является элементом squadron
            this.arrDecks = [];
        }

        static showShip(self, shipname, x, y, kx) {
            // создаём новый элемент с указанным тегом
            const div = document.createElement('div');
            // из имени корабля убираем цифры и получаем имя класса
            const classname = shipname.slice(0, -1);
            // получаем имя класса в зависимости от направления расположения корабля
            const dir = (kx===1) ? ' vertical' : '';

            // устанавливаем уникальный идентификатор для корабля
            div.setAttribute('id', shipname);
            // собираем в одну строку все классы
            div.className = `ship ${classname}${dir}`;
            // через атрибут 'style' задаём позиционирование кораблю относительно
            // его родительского элемента
            // смещение вычисляется путём умножения координаты первой палубы на
            // размер клетки игрового поля, этот размер совпадает с размером палубы
            div.style.cssText = `left:${y * Field.SHIP_SIDE}px; top:${x * Field.SHIP_SIDE}px;`;
            self.field.appendChild(div);
        }

        createShip() {
            let {player, field, shipname, decks, x, y, kx, ky, hits, arrDecks, k = 0} = this;

            while (k < decks) {
                // записываем координаты корабля в двумерный массив игрового поля
                // теперь наглядно должно быть видно, зачем мы создавали два
                // коэффициента направления палуб
                // если коэффициент равен 1, то соответствующая координата будет
                // увеличиваться при каждой итерации
                // если равен нулю, то координата будет оставаться неизменной
                // таким способом мы очень сократили и унифицировали код
                let i = x + k * kx, j = y + k * ky;

                // значение 1, записанное в ячейку двумерного массива, говорит о том, что
                // по данным координатам находится палуба некого корабля
                player.matrix[i][j] = 1;
                // записываем координаты палубы
                arrDecks.push([i, j]);
                k++;
            }

            // заносим информацию о созданном корабле в объект эскадры
            player.squadron[shipname] = {arrDecks, hits, x, y, kx, ky};
            // если корабль создан для игрока, выводим его на экран
            if (player === human) {
                Ships.showShip(human, shipname, x, y, kx);
                // когда количество кораблей в эскадре достигнет 10, т.е. все корабли
                // сгенерированны, то можно показать кнопку запуска игры
                if (Object.keys(player.squadron).length === Field.SHIPS_SIZE) {
                    buttonPlay.hidden = false;
                    serviceText.hidden = true;
                    serviceContainer.style.display = "flex";
                }
            }
        }
    }

    ///////////////////////////////////////////

    class Placement {
        // объект с координатами стророн игрового поля
        static FRAME_COORDS = getCoordinates(humanfield);

        constructor() {
            // объект перетаскивамого корабля
            this.dragObject = {};
            // флаг нажатия на левую кнопку мыши
            this.pressed = false;
        }

        static getShipName = el => el.getAttribute('id');
        static getCloneDecks = el => {
            const type = Placement.getShipName(el).slice(0, -1);
            return Field.SHIP_DATA[type][1];
        }

        setObserver() {
            if (isHandlerPlacement) return;
            document.addEventListener('mousedown', this.onMouseDown.bind(this));
            document.addEventListener('mousemove', this.onMouseMove.bind(this));
            document.addEventListener('mouseup', this.onMouseUp.bind(this));
            humanfield.addEventListener('contextmenu', this.rotationShip.bind(this));
            isHandlerPlacement = true;
        }

        onMouseDown(e) {
            // если нажата не левая кнопка мыши или игра уже запущена
            if (e.which !== 1 || startGame) return;

            // проверяем, что нажатие произошло над кораблём
            const el = e.target.closest('.ship');
            if (!el) return;

            this.pressed = true;

            // переносимый объект и его свойства
            this.dragObject = {
                el,
                parent: el.parentElement,
                next: el.nextElementSibling,
                // координаты, с которых начат перенос
                downX: e.pageX,
                downY: e.pageY,
                // координаты 'left' и 'top' используются при редактировании
                // положения корабля на игровом поле
                left: el.offsetLeft,
                top: el.offsetTop,
                // горизонтальное положение корабля
                kx: 0,
                ky: 1
            };

            // редактируем положение корабля на игровом поле
            // проверяем, что корабль находится на поле игрока
            if (el.parentElement === humanfield) {
                const name = Placement.getShipName(el);
                // запоминаем текущее направление расположения палуб
                this.dragObject.kx = human.squadron[name].kx;
                this.dragObject.ky = human.squadron[name].ky;
            }
        }

        onMouseMove(e) {
            if (!this.pressed || !this.dragObject.el) return;

            // получаем координаты сторон клона корабля
            let {left, right, top, bottom} = getCoordinates(this.dragObject.el);

            // если клона ещё не существует, создаём его
            if (!this.clone) {
                // получаем количество палуб у перемещаемого корабля
                this.decks = Placement.getCloneDecks(this.dragObject.el);
                // создаём клон, используя ранее полученные координаты его сторон
                this.clone = this.creatClone({left, right, top, bottom}) || null;
                // если по каким-то причинам клон создать не удалось, выходим из функции
                if (!this.clone) return;

                // вычисляем сдвиг курсора по координатам X и Y
                this.shiftX = this.dragObject.downX - left;
                this.shiftY = this.dragObject.downY - top;
                // z-index нужен для позиционирования клона над всеми элементами DOM
                this.clone.style.zIndex = '1000';
                // перемещаем клон в BODY
                document.body.appendChild(this.clone);

                // удаляем устаревший экземпляр корабля, если он существует
                // используется при редактировании положения корабля
                this.removeShipFromSquadron(this.clone);
            }

            // координаты клона относительно BODY с учётом сдвига курсора
            // относительно верней левой точки
            let currentLeft = Math.round(e.pageX - this.shiftX),
                currentTop = Math.round(e.pageY - this.shiftY);
            this.clone.style.left = `${currentLeft}px`;
            this.clone.style.top = `${currentTop}px`;

            // проверяем, что клон находится в пределах игрового поля, с учётом
            // небольших погрешностей (Field.FIELD_SIZE - 1px)
            if (left >= Placement.FRAME_COORDS.left - Field.FIELD_SIZE - 1 && right <= Placement.FRAME_COORDS.right + Field.FIELD_SIZE - 1 && top >= Placement.FRAME_COORDS.top - Field.FIELD_SIZE - 1 && bottom <= Placement.FRAME_COORDS.bottom + Field.FIELD_SIZE - 1) {
                // клон находится в пределах игрового поля,
                // подсвечиваем его контур зелёным цветом
                this.clone.classList.remove('unsuccess');
                this.clone.classList.add('success');

                const {x, y} = this.getCoordsCloneInMatrix({left, right, top, bottom});
                const obj = {
                    x,
                    y,
                    kx: this.dragObject.kx,
                    ky: this.dragObject.ky
                };

                const result = human.checkLocationShip(obj, this.decks);
                if (!result) {
                    // в соседних клетках находятся ранее установленные корабли,
                    // подсвечиваем его контур красным цветом
                    this.clone.classList.remove('success');
                    this.clone.classList.add('unsuccess');
                }
            } else {
                // клон находится за пределами игрового поля,
                // подсвечиваем его контур красным цветом
                this.clone.classList.remove('success');
                this.clone.classList.add('unsuccess');
            }
        }

        onMouseUp(e) {
            this.pressed = false;
            // если клона не существует
            if (!this.clone) return;

            // если координаты клона невалидны, возвращаем его на место,
            // откуда был начат перенос
            if (this.clone.classList.contains('unsuccess')) {
                this.clone.classList.remove('unsuccess');
                this.clone.rollback();
            } else {
                // создаём экземпляр нового корабля, исходя
                // из окончательных координат клона
                this.createShipAfterMoving();
            }

            // удаляем объекты 'clone' и 'dragObject'
            this.removeClone();
        }

        rotationShip(e) {
            // запрещаем появление контекстного меню
            e.preventDefault();
            if (e.which !== 3 || startGame) return;

            const el = e.target.closest('.ship');
            const name = Placement.getShipName(el);

            // нет смысла вращать однопалубный корабль
            if (human.squadron[name].decks===1) return;

            // объект с текущими коэффициентами и координатами корабля
            const obj = {
                kx: (human.squadron[name].kx===0) ? 1 : 0,
                ky: (human.squadron[name].ky===0) ? 1 : 0,
                x: human.squadron[name].x,
                y: human.squadron[name].y
            };
            // очищаем данные о редактируемом корабле
            const decks = human.squadron[name].arrDecks.length;
            this.removeShipFromSquadron(el);
            human.field.removeChild(el);

            // проверяем валидность координат после поворота
            // если координаты не валидны, возвращаем старые коэффициенты
            // направления положения корабля
            const result = human.checkLocationShip(obj, decks);
            if (!result) {
                obj.kx = (obj.kx===0) ? 1 : 0;
                obj.ky = (obj.ky===0) ? 1 : 0;
            }

            // добавляем в объект свойства нового корабля
            obj.shipname = name;
            obj.decks = decks;

            // создаём экземпляр нового корабля
            const ship = new Ships(human, obj);
            ship.createShip();

            // кратковременно подсвечиваем рамку корабля красным цветом
            if (!result) {
                const el = getElement(name);
                el.classList.add('unsuccess');
                setTimeout(() => {
                    el.classList.remove('unsuccess')
                }, 750);
            }
        }

        creatClone() {
            const clone = this.dragObject.el;
            const oldPosition = this.dragObject;

            clone.rollback = () => {
                // редактиование положения корабля
                // получаем родительский элемент и
                // возвращаем корабль на исходное место на игровом поле
                if (oldPosition.parent===humanfield) {
                    clone.style.left = `${oldPosition.left}px`;
                    clone.style.top = `${oldPosition.top}px`;
                    clone.style.zIndex = '';
                    oldPosition.parent.insertBefore(clone, oldPosition.next);
                    this.createShipAfterMoving();
                } else {
                    // возвращаем корабль в контейнер 'shipsCollection'
                    clone.removeAttribute('style');
                    oldPosition.parent.insertBefore(clone, oldPosition.next);
                }
            };
            return clone;
        }

        removeClone() {
            delete this.clone;
            this.dragObject = {};
        }

        createShipAfterMoving() {
            // получаем координаты, пересчитанные относительно игрового поля
            const coords = getCoordinates(this.clone);
            let {left, top, x, y} = this.getCoordsCloneInMatrix(coords);
            this.clone.style.left = `${left}px`;
            this.clone.style.top = `${top}px`;
            // переносим клон внутрь игрового поля
            humanfield.appendChild(this.clone);
            this.clone.classList.remove('success');

            // создаём объект со свойствами нового корабля
            const options = {
                shipname: Placement.getShipName(this.clone),
                x,
                y,
                kx: this.dragObject.kx,
                ky: this.dragObject.ky,
                decks: this.decks
            };

            // создаём экземпляр нового корабля
            const ship = new Ships(human, options);
            ship.createShip();
            // теперь в игровом поле находится сам корабль, поэтому его клон удаляем из DOM
            humanfield.removeChild(this.clone);
        }

        getCoordsCloneInMatrix({left, right, top, bottom} = coords) {
            // вычисляем разницу координат соотвествующих сторон
            // клона и игрового поля
            let computedLeft = left - Placement.FRAME_COORDS.left,
                computedRight = right - Placement.FRAME_COORDS.left,
                computedTop = top - Placement.FRAME_COORDS.top,
                computedBottom = bottom - Placement.FRAME_COORDS.top;

            // создаём объект, куда поместим итоговые значения
            const obj = {};

            // в результате выполнения условия, убираем неточности позиционирования клона
            let ft = (computedTop < 0) ? 0 : (computedBottom > Field.FIELD_SIDE) ? Field.FIELD_SIDE - Field.SHIP_SIDE : computedTop;
            let fl = (computedLeft < 0) ? 0 : (computedRight > Field.FIELD_SIDE) ? Field.FIELD_SIDE - Field.SHIP_SIDE * this.decks : computedLeft;

            obj.top = Math.round(ft / Field.SHIP_SIDE) * Field.SHIP_SIDE;
            obj.left = Math.round(fl / Field.SHIP_SIDE) * Field.SHIP_SIDE;
            // переводим значение в координатах матрицы
            obj.x = obj.top / Field.SHIP_SIDE;
            obj.y = obj.left / Field.SHIP_SIDE;

            return obj;
        }

        removeShipFromSquadron(el) {
            // имя редактируемого корабля
            const name = Placement.getShipName(el);
            // если корабля с таким именем не существует,
            // прекращаем работу функции
            if (!human.squadron[name]) return;

            // получаем массив с координатами палуб корабля и
            // записываем в него нули, что означает - пустое место
            const arr = human.squadron[name].arrDecks;
            for (let coords of arr) {
                const [x, y] = coords;
                human.matrix[x][y] = 0;
            }
            // удаляем всю информацию о корабле из массива эскадры
            delete human.squadron[name];
        }
    }

    ///////////////////////////////////////////

    class Controller {
        // массив базовых координат для формирования coordsFixedHit
        static START_POINTS = [
            [[6, 0], [2, 0], [0, 2], [0, 6]],
            [[3, 0], [7, 0], [9, 2], [9, 6]]
        ];
        // Блок, в который выводятся информационные сообщения по ходу игры
        static SERVICE_CONTAINER = getElement('service_container');
        static SERVICE_TEXT = getElement('service_text');

        constructor() {
            this.player = '';
            this.opponent = '';
            this.text = '';
            // массив с координатами выстрелов при рандомном выборе
            this.coordsRandomHit = [];
            // массив с заранее вычисленными координатами выстрелов
            this.coordsFixedHit = [];
            // массив с координатами вокруг клетки с попаданием
            this.coordsAroundHit = [];

        }

        // вывод информационных сообщений
        static showServiceText = text => {
            Controller.SERVICE_TEXT.innerHTML = text;
        }

        // удаление ненужных координат из массива
        static removeElementArray = (arr, [x, y]) => {
            return arr.filter(item => item[0] !== x || item[1] !== y);
        }

        init() {
            // Рандомно выбираем игрока и его противника
            const random = Field.getRandom(1);
            this.player = (random === 0) ? human : computer;
            this.opponent = (this.player === human) ? computer : human;

            // генерируем координаты выстрелов компьютера и заносим их в
            // массивы coordsRandomHit и coordsFixedHit
            this.setCoordsShot();

            // обработчики события для игрока
            if (!isHandlerController) {
                //выстрел игрока
                computerfield.addEventListener('click', this.makeShot.bind(this));

                isHandlerController = true;
            }

            if (this.player === human) {
                compShot = false;
                this.text = 'Вы стреляете первым';
            } else {
                compShot = true;
                this.text = 'Первым стреляет компьютер';
                // выстрел компьютера
                setTimeout(() => this.makeShot(), 500);
            }
            Controller.showServiceText(this.text);
        }

        setCoordsShot() {
            // получаем координаты каждой клетки игрового поля и записываем их в массив
            for (let i = 0; i < Field.FIELD_SIZE; i++) {
                for (let j = 0; j < Field.FIELD_SIZE; j++) {
                    this.coordsRandomHit.push([i, j]);
                }
            }
            // рандомно перемешиваем массив с координатами
            this.coordsRandomHit.sort((a, b) => Math.random() - 0.5);

        }

        // устанавливаем маркеры вокруг корабля при попадании
        async markUselessCell(coords, opp) {
            let n = 1, x, y;

            for (let coord of coords) {
                x = coord[0];
                y = coord[1];
                // координаты за пределами игрового поля
                if (x < 0 || x > Field.FIELD_SIZE - 1 || y < 0 || y > Field.FIELD_SIZE - 1) continue;
                // по этим координатам в матрице уже прописан промах или маркер пустой клетки
                if (opp.matrix[x][y] === 4 || opp.matrix[x][y] === 3|| opp.matrix[x][y] === 2) continue;
                // прописываем значение, соответствующее маркеру пустой клетки
                opp.matrix[x][y] = 2;
                // вывоим маркеры пустых клеток по полученным координатам
                // для того, чтобы маркеры выводились поочерёдно, при каждой итерации
                // увеличиваем задержку перед выводом маркера
                await this.showIcons(opp, coord, 'dot');
                // удаляем полученные координаты из всех массивов
                // this.removeCoordsFromArrays(coord);
                n++;
            }
        }

        // устанавливаем маркеры на коробле при крушении
        async markShadedCell(coords, opp) {
            let n = 1, x, y;
            for (let coord of coords) {
                x = coord[0];
                y = coord[1];
                // координаты за пределами игрового поля
                if (x < 0 || x > Field.FIELD_SIZE - 1 || y < 0 || y > Field.FIELD_SIZE - 1) continue;
                // по этим координатам в матрице уже прописан промах или маркер пустой клетки
                if (opp.matrix[x][y] === 4) continue;
                // прописываем значение, соответствующее маркеру пустой клетки
                opp.matrix[x][y] = 4;
                await this.showIcons(opp, coord, 'shaded-cell')
                n++;
            }

        }

        transformCoordsInMatrix(e, self) {
            const x = Math.trunc((e.pageY - self.fieldTop) / Field.SHIP_SIDE);
            const y = Math.trunc((e.pageX - self.fieldLeft) / Field.SHIP_SIDE);
            return [x, y];
        }

        removeCoordsFromArrays(coords) {
            this.coordsRandomHit = Controller.removeElementArray(this.coordsRandomHit, coords);
        }

        showIcons(opponent, [x, y], iconClass) {
            return new Promise(function cb(resolve, reject) {
                // экземпляр игрового поля на котором будет размещена иконка
                const field = opponent.field;

                // создание элемента и добавление ему класса и стилей
                let styleText = `left:${y * Field.SHIP_SIDE}px; top:${x * Field.SHIP_SIDE}px;`;
                if (document.querySelectorAll(`span[style*=${iconClass}]`).length) {
                    const span = document.querySelectorAll(`span[style*=${styleText}],span[class*=${iconClass}]`);
                    span.className = `icon-field ${iconClass}`;
                } else {
                    const span = document.createElement('span');
                    span.className = `icon-field ${iconClass}`;
                    span.style.cssText = styleText;
                    // размещаем иконку на игровом поле
                    field.appendChild(span);
                }
                resolve(true);

            });

        }

        getCoordsForShot() {
            const coords = this.coordsRandomHit.pop();
            // удаляем полученные координаты из всех массивов
            this.removeCoordsFromArrays(coords);
            return coords;
        }

        makeShot(e) {
            let x, y;

            if (!(compShot && this.player === human) || !(!compShot && this.player === computer)) {
                // если событие существует, значит выстрел сделан игроком
                if (e !== undefined) {
                    // если клик не левой кнопкой мыши или установлен флаг compShot,
                    // что значит, должен стрелять компьютер
                    if (e.which !== 1 || compShot) return;
                    // координаты выстрела в системе координат матрицы
                    ([x, y] = this.transformCoordsInMatrix(e, this.opponent));

                } else {
                    // получаем координаты для выстрела компьютера
                    ([x, y] = this.getCoordsForShot());
                }

                const v = this.opponent.matrix[x][y];
                switch (v) {
                    case 0: // промах
                        this.miss(x, y).then();
                        break;
                    case 1: // попадание
                        this.hit(x, y).then();
                        break; // повторный обстрел
                    case 3:
                    case 4:
                        Controller.showServiceText('По этим координатам вы уже стреляли!');
                        break;
                }
            }

        }

        async miss(x, y) {
            let text = "";
            // устанавливаем иконку промаха и записываем промах в матрицу
            await this.showIcons(this.opponent, [x, y], 'dot');
            this.opponent.matrix[x][y] = 2;

            // определяем статус игроков
            if (this.player === human) {
                text = 'Вы промахнулись. Выстрел компьютера.';
                Controller.showServiceText(text);
                this.player = computer;
                this.opponent = human;
                compShot = true;
                this.makeShot();
            } else {
                text = 'Компьютер промахнулся. Ваш выстрел.';
                Controller.showServiceText(text);
                this.player = human;
                this.opponent = computer;
                compShot = false;
            }

        }

        async hit(x, y) {
            let text = "";
            // устанавливаем иконку попадания и записываем попадание в матрицу
            await this.showIcons(this.opponent, [x, y], 'red-cross');
            this.opponent.matrix[x][y] = 3;
            // выводим текст, зависящий от стреляющего
            text = (this.player === human) ? 'Вы ранили корабль. Снова ваш выстрел.' : '';
            Controller.showServiceText(text);

            // перебираем корабли эскадры противника
            outerloop:
                for (let name in this.opponent.squadron) {
                    const dataShip = this.opponent.squadron[name];
                    for (let value of dataShip.arrDecks) {
                        // перебираем координаты палуб и сравниваем с координатами попадания
                        // если координаты не совпадают, переходим к следующей итерации
                        if (value[0] !== x || value[1] !== y) continue;
                        dataShip.hits++;

                        if (dataShip.hits < dataShip.arrDecks.length) break outerloop;

                        let coordsDot = [];
                        for (let i = 0; i < dataShip.arrDecks.length; i++) {
                            let x = dataShip.arrDecks[i][0];
                            let y = dataShip.arrDecks[i][1];

                            if (dataShip.arrDecks.length === 1) {
                                this.addCoordsToArr(coordsDot, [x - 1, y - 1]);
                                this.addCoordsToArr(coordsDot, [x - 1, y]);
                                this.addCoordsToArr(coordsDot, [x - 1, y + 1]);
                                this.addCoordsToArr(coordsDot, [x, y - 1]);
                                this.addCoordsToArr(coordsDot, [x, y + 1]);
                                this.addCoordsToArr(coordsDot, [x + 1, y + 1]);
                                this.addCoordsToArr(coordsDot, [x + 1, y]);
                                this.addCoordsToArr(coordsDot, [x + 1, y - 1]);
                            } else if (dataShip.kx === 1 && dataShip.ky === 0) {
                                if (i === 0) {
                                    this.addCoordsToArr(coordsDot, [x - 1, y]);
                                    this.addCoordsToArr(coordsDot, [x - 1, y - 1]);
                                    this.addCoordsToArr(coordsDot, [x - 1, y + 1]);
                                } else if (i === dataShip.arrDecks.length - 1) {
                                    this.addCoordsToArr(coordsDot, [x + 1, y]);
                                    this.addCoordsToArr(coordsDot, [x + 1, y - 1]);
                                    this.addCoordsToArr(coordsDot, [x + 1, y + 1]);
                                }
                                this.addCoordsToArr(coordsDot, [x, y - 1]);
                                this.addCoordsToArr(coordsDot, [x, y + 1]);

                            } else if (dataShip.kx === 0 && dataShip.ky === 1) {
                                if (i === 0) {
                                    this.addCoordsToArr(coordsDot, [x - 1, y - 1]);
                                    this.addCoordsToArr(coordsDot, [x, y - 1]);
                                    this.addCoordsToArr(coordsDot, [x + 1, y - 1]);
                                } else if (i === dataShip.arrDecks.length - 1) {
                                    this.addCoordsToArr(coordsDot, [x - 1, y + 1]);
                                    this.addCoordsToArr(coordsDot, [x, y + 1]);
                                    this.addCoordsToArr(coordsDot, [x + 1, y + 1]);
                                }
                                this.addCoordsToArr(coordsDot, [x - 1, y]);
                                this.addCoordsToArr(coordsDot, [x + 1, y]);

                            }
                        }
                        this.markShadedCell(dataShip.arrDecks, this.opponent).then();
                        text = (this.player === human) ? 'Вы убили корабль. Снова ваш выстрел.' : '';
                        Controller.showServiceText(text);
                        delete this.opponent.squadron[name];
                        break outerloop;
                    }
                }

            // все корабли эскадры уничтожены
            if (Object.keys(this.opponent.squadron).length === 0) {
                if (this.opponent === human) {
                    text = 'Вы проиграли.';
                    // показываем оставшиеся корабли компьютера
                    for (let name in computer.squadron) {
                        const dataShip = computer.squadron[name];
                        Ships.showShip(computer, name, dataShip.x, dataShip.y, dataShip.kx);
                    }
                } else {
                    text = 'Вы выиграли!';
                }
                buttonNewGame.innerText = text + " Начать новую";
                Controller.showServiceText("");
                // показываем кнопку продолжения игры
                buttonNewGame.hidden = false;
                // бой продолжается
            } else if (this.opponent === human) {
                this.makeShot();
            }

        }

        addCoordsToArr(coordsArr, coords) {
            if ((coords[0] >= 0 && coords[1] >= 0) &&
                (coords[0] < Field.FIELD_SIZE && coords[1] < Field.FIELD_SIZE)) {
                this.removeCoordsFromArrays(coords)
                this.markUselessCell([coords], this.opponent).then();
            }
        }
    }


    ///////////////////////////////////////////

    // родительский контейнер с инструкцией
    const instruction = getElement('instruction');
    // контейнер, в котором будут размещаться корабли, предназначенные для перетаскивания
    // на игровое поле
    const shipsCollection = getElement('ships_collection');
    // контейнер с набором кораблей, предназначенных для перетаскивания
    // на игровое поле
    const initialShips = document.querySelector('.initial-ships');
    // контейнер с заголовком
    const toptext = getElement('text_top');
    // блок текста
    const serviceContainer = getElement('service_container');
    const serviceText = getElement('service_text');
    // кнопка начала игры
    const buttonPlay = getElement('play');
    // кнопка перезапуска игры
    const buttonNewGame = getElement('newgame');

    // получаем экземпляр игрового поля игрока
    const human = new Field(humanfield);
    // экземпляр игрового поля только регистрируем
    let computer = {};

    let control = null;

    getElement('type_placement').addEventListener('click', function (e) {
        // используем делегирование основанное на всплытии событий
        if (e.target.tagName !== 'SPAN') return;

        // если мы уже создали эскадру ранее, то видна кнопка начала игры
        // скроем её на время повторной расстановки кораблей
        buttonPlay.hidden = true;
        serviceContainer.style.display = "none";
        serviceText.hidden = true;
        // очищаем игровое поле игрока перед повторной расстановкой кораблей
        human.cleanField();

        // очищаем клон объекта с набором кораблей
        let initialShipsClone = '';
        // способ расстановки кораблей на игровом поле
        const type = e.target.dataset.target;
        // создаём литеральный объект typeGeneration
        // каждому свойству литерального объекта соответствует функция
        // в которой вызывается рандомная или ручная расстановка кораблей
        const typeGeneration = {
            random() {
                // скрываем контейнер с кораблями, предназначенными для перетаскивания
                // на игровое поле
                shipsCollection.hidden = true;
                // вызов ф-ии рандомно расставляющей корабли для экземпляра игрока
                human.randomLocationShips();
            },
            manually() {
                // определяем видимость набора кораблей
                let value = !shipsCollection.hidden;

                // если в контейнере, кроме информационной строки, находится набор
                // кораблей, то удаляем его
                if (shipsCollection.children.length > 1) {
                    shipsCollection.removeChild(shipsCollection.lastChild);
                }

                // если набор кораблей при клике на псевдоссылку был невидим, то
                // клнируем его, переносим в игровой контейнер и выводим на экран
                if (!value) {
                    initialShipsClone = initialShips.cloneNode(true);
                    shipsCollection.appendChild(initialShipsClone);
                    initialShipsClone.hidden = false;
                }
                // в зависимости от полученного значения value показываем или скрываем
                // блок с набором кораблей
                shipsCollection.hidden = value;
            }
        };
        // вызов функции литерального объекта в зависимости
        // от способа расстановки кораблей
        typeGeneration[type]();

        // создаём экземпляр класса, отвечающего за перетаскивание
        // и редактирование положения кораблей
        const placement = new Placement();
        // устанавливаем обработчики событий
        placement.setObserver();
    });

    buttonPlay.addEventListener('click', function (e) {
        // скрываем не нужные для игры элементы
        buttonPlay.hidden = true;
        serviceText.hidden = false;
        // serviceContainer.style.display = "none";
        instruction.hidden = true;
        // показываем игровое поле компьютера
        computerfield.parentElement.hidden = false;
        computerfield.parentElement.parentElement.hidden = false;
        toptext.innerHTML = 'Арктический морской бой';

        // создаём экземпляр игрового поля компьютера
        computer = new Field(computerfield);
        // очищаем поле от ранее установленных кораблей
        computer.cleanField();
        computer.randomLocationShips();
        // устанавливаем флаг запуска игры
        startGame = true;

        // создаём экземпляр контроллера, управляющего игрой
        if (!control) control = new Controller();
        // запускаем игру
        control.init();
    });

    buttonNewGame.addEventListener('click', function (e) {
        // скрываем кнопку перезапуска игры
        buttonNewGame.hidden = true;
        buttonNewGame.innerText = "Начать новую";
        // скрываем игровое поле компьютера
        computerfield.parentElement.hidden = true;
        computerfield.parentElement.parentElement.hidden = true;

        serviceContainer.style.display = 'none';
        // показываем управляющие элементы выбора способа
        // расстановки кораблей
        instruction.hidden = false;
        // очищаем поле игрока
        human.cleanField();
        toptext.innerHTML = 'Расстановка кораблей';
        Controller.SERVICE_TEXT.innerHTML = '';

        // устанавливаем флаги в исходное состояние
        startGame = false;
        compShot = false;

        // обнуляем массивы с координатами выстрела
        control.coordsRandomHit = [];
    });

})();
