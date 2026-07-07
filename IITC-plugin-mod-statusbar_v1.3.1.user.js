// ==UserScript==
// @author         DOPPELGENGER,CLAUDE(MACHINA)
// @id             IITC-plugin-mod-statusbar
// @name           IITC plugin: MOD abbreviation in statusbar
// @category       d.org.addon
// @version        1.3.1
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @description    [1.3.1]ステータスバーに、装着MODの略号を色付き・スロット位置固定で表示する。挿入位置は「ポータルレベル/XMエネルギーの前」と「その後・ポータル名の前」から選択可能。画面下情報バーの左パディングを1px単位で調整でき (既定5px)、画面端が丸いスマホでMOD文字が隠れる問題に対応。空欄文字・MODアイコン・MODカラーを一括初期化するボタン付き。略号入力欄は半角4文字分の幅を確保し、設定ダイアログの入力欄はタップ(またはTabキー)以外でフォーカスが外れないようにして、Androidで文字カーソルを左右移動させた際に入力がキャンセルされる不具合に対応。設定画面はOKボタン1つで反映・閉じるを行う。IITC.statusbar API の無い旧ビルド (iOS版アプリ等) にもフォールバック対応。
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

function wrapper(plugin_info) {
    'use strict';

    if (typeof window.plugin !== 'function') window.plugin = function () {};

    plugin_info.pluginId = 'mod-statusbar';

    window.plugin.modStatusbar = function () {};
    var self = window.plugin.modStatusbar;

    // ---- 設定キー ---------------------------------------------------------
    self.KEY_ENABLED  = 'plugin-mod-statusbar-enabled';
    self.KEY_COLORED  = 'plugin-mod-statusbar-colored';
    self.KEY_MAP      = 'plugin-mod-statusbar-map';
    self.KEY_COLORS   = 'plugin-mod-statusbar-colors';
    self.KEY_BLANK    = 'plugin-mod-statusbar-blank';
    self.KEY_POSITION = 'plugin-mod-statusbar-position';
    self.KEY_OFFSETX  = 'plugin-mod-statusbar-offsetx';

    // 空きスロット/非表示MODの既定プレースホルダー文字
    self.DEFAULT_BLANK = '□';
    // 情報バー右スライドの既定値 (px)。画面端が丸いスマホでも既定である程度
    // MOD文字が隠れないよう、0ではなく5pxを既定とする。
    self.DEFAULT_OFFSETX = 5;
    // 設定画面のMOD一覧にある「略号」入力欄の幅 (px)。
    // 半角4文字程度が欠けずに見える大きさを既定値としている。
    // 見た目や好みに応じて、この値を変えるだけで調整できる。
    self.MOD_ABBR_INPUT_WIDTH = 48;

    // ---- 既定の略号テーブル ----------------------------------------------
    // キーは "<正規化MOD名>|<RARITY>"。
    // 正規化 = 小文字化し、英数字と + - 以外を除去。
    //   "Portal Shield" / VERY_RARE      -> "portalshield|VERY_RARE"
    //   "Ito En Transmuter (+)" / VERY_RARE -> "itoentransmuter+|VERY_RARE"
    // ※ MOD名はIntelサーバ由来の生文字列であり、IITCコアには定義が無い。
    //   新MODが登場した場合は fallback の自動略号か、設定画面から追加する。
    self.defaultMap = {
        'portalshield|COMMON':           'CPS',
        'portalshield|RARE':             'RPS',
        'portalshield|VERY_RARE':        'VRPS',
        'aegisshield|VERY_RARE':         'AS',
        'multi-hack|COMMON':              'CMH',
        'multi-hack|RARE':                'RMH',
        'multi-hack|VERY_RARE':           'VMH',
        'heatsink|COMMON':               'CHS',
        'heatsink|RARE':                 'RHS',
        'heatsink|VERY_RARE':            'VRHS',
        'linkamp|RARE':                  'LA',
        'linkamp|VERY_RARE':             'VRLA',
        'softbankultralink|VERY_RARE':   '禿',
        'turret|RARE':                   'TU',
        'forceamp|RARE':                 'FA',
        'itoentransmuter+|VERY_RARE':    'IT+',
        'itoentransmuter-|VERY_RARE':    'IT-',
    };

    // ---- 既定の色テーブル (mod-overhead と同一の配色) ----------------------
    // レアリティ既定色 (個別色が未定義のMODのフォールバック用)
    self.rarityColors = {
        COMMON:    '#8FF0A4',
        RARE:      '#3584E4',
        VERY_RARE: '#E01B24'
    };

    self.defaultColors = {
        'portalshield|COMMON':           '#8FF0A4',
        'portalshield|RARE':             '#3584E4',
        'portalshield|VERY_RARE':        '#FF66FF',
        'aegisshield|VERY_RARE':         '#E01B24',
        'multi-hack|COMMON':             '#8FF0A4',
        'multi-hack|RARE':               '#3584E4',
        'multi-hack|VERY_RARE':          '#E01B24',
        'heatsink|COMMON':               '#8FF0A4',
        'heatsink|RARE':                 '#3584E4',
        'heatsink|VERY_RARE':            '#E01B24',
        'linkamp|RARE':                  '#3584E4',
        'linkamp|VERY_RARE':             '#E01B24',
        'softbankultralink|VERY_RARE':   '#F6D32D',
        'turret|RARE':                   '#3584E4',
        'forceamp|RARE':                 '#3584E4',
        'itoentransmuter+|VERY_RARE':    '#FF66FF',
        'itoentransmuter-|VERY_RARE':    '#FF66FF',
    };

    self.userMap = {};
    self.userColors = {};
    self.effectiveMap = {};
    self.enabled = true;
    self.colored = true;
    self.blankChar = self.DEFAULT_BLANK;
    // true: MOD略号をポータルレベル/XMエネルギー("L8 100%"部分)より前に挿入
    //       (例: "MOD,MOD L8 100% ポータル名")
    // false: MOD略号をポータルレベル/XMエネルギーの後・ポータル名の前に挿入
    //       (例: "L8 100% MOD,MOD ポータル名")
    self.prepend = true;
    // 画面下の情報バー (#mobileinfo) の左パディング追加分 (px単位、既定5)。
    // 画面端が丸いスマホでは #mobileinfo が画面左端ぴったりに描画されるため、
    // 先頭に表示されるMOD文字が丸みで隠れてしまうことがある。この値を
    // 大きくすることでMOD文字の表示開始位置を右にずらして回避できる。
    self.offsetX = self.DEFAULT_OFFSETX;

    // ---- 設定の読み書き ---------------------------------------------------
    self.loadSettings = function () {
        self.enabled = (localStorage[self.KEY_ENABLED] !== 'false'); // 既定ON
        self.colored = (localStorage[self.KEY_COLORED] !== 'false'); // 既定ON
        // 空欄文字は未設定時のみ既定値(□)を使う。ユーザーが明示的に空文字へ
        // 変更した場合はそれを尊重する(位置を示す隙間だけを残す用途のため)。
        self.blankChar = (self.KEY_BLANK in localStorage) ? localStorage[self.KEY_BLANK] : self.DEFAULT_BLANK;
        self.prepend = (localStorage[self.KEY_POSITION] !== 'append'); // 既定は前置
        // 未設定時のみ既定値(5px)を使う。ユーザーが明示的に0へ変更した
        // 場合はそれを尊重する。
        self.offsetX = (self.KEY_OFFSETX in localStorage) ? parseInt(localStorage[self.KEY_OFFSETX], 10) : self.DEFAULT_OFFSETX;
        if (!isFinite(self.offsetX) || self.offsetX < 0) self.offsetX = self.DEFAULT_OFFSETX;
        try {
            self.userMap = JSON.parse(localStorage[self.KEY_MAP] || '{}') || {};
        } catch (e) {
            self.userMap = {};
        }
        try {
            self.userColors = JSON.parse(localStorage[self.KEY_COLORS] || '{}') || {};
        } catch (e) {
            self.userColors = {};
        }
        self.effectiveMap = {};
        var k;
        for (k in self.defaultMap) self.effectiveMap[k] = self.defaultMap[k];
        for (k in self.userMap)    self.effectiveMap[k] = self.userMap[k];
    };

    self.saveSettings = function () {
        localStorage[self.KEY_ENABLED]  = self.enabled ? 'true' : 'false';
        localStorage[self.KEY_COLORED]  = self.colored ? 'true' : 'false';
        localStorage[self.KEY_BLANK]    = self.blankChar;
        localStorage[self.KEY_POSITION] = self.prepend ? 'prepend' : 'append';
        localStorage[self.KEY_OFFSETX]  = String(self.offsetX);
        localStorage[self.KEY_MAP]      = JSON.stringify(self.userMap || {});
        localStorage[self.KEY_COLORS]   = JSON.stringify(self.userColors || {});
    };

    // ---- MOD -> 略号/色 ----------------------------------------------------
    // + と - は Transmuter (+)/(-) の識別に必須のため保持する
    self.normalize = function (name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9+\-]/g, '');
    };

    self.rarityPrefix = function (rarity) {
        switch (String(rarity || '').toUpperCase()) {
            case 'COMMON':    return 'C';
            case 'RARE':      return 'R';
            case 'VERY_RARE': return 'V';
            default:          return '';
        }
    };

    self.defaultColorFor = function (key) {
        if (key in self.defaultColors) return self.defaultColors[key];
        var rarity = String(key).split('|')[1] || '';
        return self.rarityColors[rarity] || '#DEDDDA';
    };

    self.colorFor = function (key) {
        return self.userColors[key] || self.defaultColorFor(key);
    };

    self.escapeHtml = function (s) {
        return String(s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    // MOD 1個を {abbr, color} に変換する。非表示設定なら null。
    self.modToEntry = function (mod) {
        if (!mod) return null;
        var key = self.normalize(mod.name) + '|' + String(mod.rarity || '').toUpperCase();
        var abbr;
        if (key in self.effectiveMap) {
            // 空文字が設定されているMODは非表示扱い
            abbr = self.effectiveMap[key] || null;
        } else {
            // 未知のMODは rarity頭文字 + 名前の子音2字 (+/-があれば付加) で自動生成
            var norm = self.normalize(mod.name);
            var sign = '';
            if (norm.indexOf('+') !== -1) sign = '+';
            else if (norm.indexOf('-') !== -1) sign = '-';
            var base = norm.replace(/[^a-z0-9]/g, '').replace(/[aeiou]/g, '').toUpperCase().slice(0, 2);
            abbr = self.rarityPrefix(mod.rarity) + (base || '?') + sign;
        }
        if (!abbr) return null;
        return { abbr: abbr, color: self.colorFor(key) };
    };

    // 旧API互換
    self.modToAbbr = function (mod) {
        var e = self.modToEntry(mod);
        return e ? e.abbr : null;
    };

    // 選択ポータルのMOD略号列を作る。
    // MODは詳細データ (portalDetail) にのみ含まれる。未ロード時は空を返す。
    // details.mods は4スロット固定の配列 (空きスロットは null) であり、
    // 配列インデックス = ポータル上の実際の装着位置に対応する。
    // 略号を単純に詰めて表示すると、どのスロットが空きなのか位置情報が
    // 失われる (例: 1番目が空きの場合と3番目が空きの場合が区別できない) ため、
    // 空き/非表示スロットは self.blankChar で埋めて位置を固定表示する。
    self.buildModEntries = function (guid) {
        if (!guid || !window.portalDetail) return [];
        var details = window.portalDetail.get(guid);
        if (!details || !details.mods) return [];
        var raw = [];
        var hasAny = false;
        for (var i = 0; i < details.mods.length; i++) {
            var e = self.modToEntry(details.mods[i]);
            raw.push(e);
            if (e) hasAny = true;
        }
        // 実際に表示すべきMODが1つも無ければ (空きポータル、または
        // 全MODがユーザー設定で非表示) 従来通り何も表示しない。
        if (!hasAny) return [];
        var out = [];
        for (var j = 0; j < raw.length; j++) {
            out.push(raw[j] || { abbr: self.blankChar, color: null, blank: true });
        }
        return out;
    };

    // 旧API互換 (例: "AS,VMH,CPS,RPS")
    self.buildModString = function (guid) {
        return self.buildModEntries(guid).map(function (e) { return e.abbr; }).join(',');
    };

    // #mobileinfo (画面下情報バーの左半分、MOD文字はこの先頭に表示される)
    // の左パディングを self.offsetX px 分だけ追加し、表示開始位置を右へ
    // ずらす。#innerstatus (右半分、マップ情報) や #updatestatus 全体の
    // 幅には触れないため、右端側のレイアウトへの副作用が無い。
    // #mobileinfo は IITC.statusbar.init() が動的に生成する要素であり、
    // 本プラグインの setup() 実行時点ではまだ存在しない場合があるため、
    // ステータスバー更新の都度 (getData / decorateMobileinfo 呼び出し時) に
    // 呼び直して確実に適用する。jQuery指定なので要素が無くても無害。
    self.applyOffset = function () {
        $('#mobileinfo').css('padding-left', self.offsetX > 0 ? self.offsetX + 'px' : '');
    };

    // ---- ステータスバーへの差し込み --------------------------------------
    // IITC.statusbar.portal.getData をラップし、返却データの title の前に
    // MOD略号列を常に埋め込む (レベル/エネルギー表示は title に含まれず、
    // render 側で別要素として組み立てられるビルドがあるため、ここでは
    // 「ポータル名の直前」という一貫した位置にのみ挿入する)。
    // self.prepend による「レベル/エネルギーより前か後か」の切替は、
    // render ラップ側 (hookRender) で実際の描画済みHTML上で行う。
    // ネイティブ描画 (app.setPortalStatus) と HTML描画 (#mobileinfo) の
    // 両経路がこの getData を通るため、これで足りる。
    // 色付けは render ラップ側 (hookRender) で行い、この時点では
    // プレーンテキストのみを扱う。ネイティブ描画はHTMLを解釈できないため。
    // 注意: 返却オブジェクトは _lastSentData としてキャッシュされるため、
    // 破壊せずシャローコピーへ挿入する。
    self.hookGetData = function () {
        if (!(window.IITC && IITC.statusbar && IITC.statusbar.portal &&
              typeof IITC.statusbar.portal.getData === 'function')) {
            return false;
        }
        var p = IITC.statusbar.portal;
        if (p.__modOrigGetData) return true; // 二重ラップ防止
        p.__modOrigGetData = p.getData;
        p.getData = function (guid) {
            self.applyOffset();
            var data = p.__modOrigGetData.call(p, guid);
            if (!self.enabled || !data || !data.title) return data;
            var entries = self.buildModEntries(data.guid || guid);
            if (!entries.length) return data;
            // MOD間はカンマ区切り、ポータル名とはスペース区切りで
            // 常に「ポータル名の直前」に埋め込む。
            // 例: "AS,□,禿,VRHS ポータル名"
            var plain = entries.map(function (e) { return e.abbr; }).join(',');
            var out = Object.assign({}, data, { title: plain + ' ' + data.title });
            // render ラップが色付きHTMLへ置換・要位置移動するための情報
            // (プレーンMOD文字列と対応する色付きHTML)。
            // render 未対応ビルドでは単に無視され、常に「ポータル名の前」に
            // プレーン表示される (ネイティブ描画にはレベル/エネルギーが
            // 別要素のため、これ以上前に出す手段が無い)。
            out.__modPlain = plain;
            out.__modHtml = entries.map(function (e) {
                if (e.blank) return self.escapeHtml(e.abbr); // 空きスロットは無色のまま
                // 記号色 + 同色グロー (mod-overhead と同じ視認性向上手法)
                return '<span style="color:' + e.color +
                       ';text-shadow:0 0 3px ' + e.color + ',0 0 3px ' + e.color + ',0 0 1px #000;">' +
                       self.escapeHtml(e.abbr) + '</span>';
            }).join(',');
            return out;
        };
        return true;
    };

    // HTML描画経路 (IITC.statusbar.portal.render) をラップし、
    // getData が埋め込んだプレーンな略号列を色付き<span>へ置換する。
    // さらに self.prepend が true の場合は、埋め込み位置 (ポータル名の
    // 直前 = レベル/エネルギーの後) から、描画済みHTML全体の先頭
    // (レベル/エネルギーより前) へ移動させる。
    // render が存在しない/挙動が異なるビルドでは何もしない (略号は従来通り
    // 「ポータル名の前」にプレーンテキストで表示されるだけで、機能は
    // 失われない)。
    self.hookRender = function () {
        if (!(window.IITC && IITC.statusbar && IITC.statusbar.portal)) return false;
        var p = IITC.statusbar.portal;
        if (typeof p.render !== 'function') return false;
        if (p.__modOrigRender) return true; // 二重ラップ防止
        p.__modOrigRender = p.render;
        p.render = function (data) {
            var html = p.__modOrigRender.apply(p, arguments);
            if (!self.enabled || typeof html !== 'string') return html;
            if (!data || !data.__modPlain || !data.__modHtml) return html;
            var replacement = self.colored ? data.__modHtml : self.escapeHtml(data.__modPlain);
            // render側でtitleがHTMLエスケープされる場合に備え、生とエスケープ済みの
            // 両方を、埋め込み時と同じ区切りスペース込みで探す。
            var candidates = [data.__modPlain + ' ', self.escapeHtml(data.__modPlain) + ' '];
            for (var i = 0; i < candidates.length; i++) {
                var idx = html.indexOf(candidates[i]);
                if (idx !== -1) {
                    if (self.prepend) {
                        // 埋め込み位置から取り除き、HTML全体の先頭 (レベル/
                        // エネルギーより前) へ移動する。
                        var without = html.slice(0, idx) + html.slice(idx + candidates[i].length);
                        return replacement + ' ' + without;
                    }
                    return html.slice(0, idx) + replacement + ' ' + html.slice(idx + candidates[i].length);
                }
            }
            return html; // 見つからなければ従来のプレーン表示のまま
        };
        return true;
    };

    // ---- 旧ビルド (IITC.statusbar が無い環境) 向けフォールバック ----------
    // iOS版IITCアプリ等の旧IITCビルドには IITC.statusbar.portal が存在せず、
    // スマホ用ステータスバーは window.smartphoneInfo() が #mobileinfo を
    // 直接書き換える方式になっている。この環境では smartphoneInfo をラップし、
    // 描画後の #mobileinfo にMOD略号ブロックを差し込む。
    // #mobileinfo はHTMLなので、この経路では色付けもそのまま有効。

    // #mobileinfo へMOD略号を差し込む (何度呼んでも二重挿入しない)。
    // この経路ではレベル/エネルギーとポータル名が分離不能な1つのHTML塊
    // として組み立てられるため、self.prepend は「#mobileinfo全体の先頭
    // (ON)」か「末尾 (OFF)」かの近似でしか切り替えられない (レベル/
    // エネルギーとポータル名の間へ厳密に挿入することはできない)。
    self.decorateMobileinfo = function (guid) {
        self.applyOffset();
        var el = $('#mobileinfo');
        if (!el.length) return;
        el.find('.mod-statusbar-mods').remove(); // 再描画・再呼び出し時の二重挿入防止
        if (!self.enabled) return;
        guid = guid || window.selectedPortal;
        var entries = self.buildModEntries(guid);
        if (!entries.length) return;
        var inner = entries.map(function (e) {
            if (e.blank || !self.colored) return self.escapeHtml(e.abbr);
            return '<span style="color:' + e.color +
                   ';text-shadow:0 0 3px ' + e.color + ',0 0 3px ' + e.color + ',0 0 1px #000;">' +
                   self.escapeHtml(e.abbr) + '</span>';
        }).join(',');
        var block = '<span class="mod-statusbar-mods">' +
            (self.prepend ? inner + ' ' : ' ' + inner) + '</span>';
        if (self.prepend) el.prepend(block);
        else el.append(block);
    };

    self.hookSmartphoneInfo = function () {
        if (typeof window.smartphoneInfo !== 'function') return false;
        if (window.smartphoneInfo.__modWrapped) return true; // 二重ラップ防止
        var orig = window.smartphoneInfo;
        window.smartphoneInfo = function (data) {
            orig.apply(this, arguments);
            try {
                self.decorateMobileinfo(data && data.selectedPortalGuid);
            } catch (e) {
                console.error('mod-statusbar decorate error', e);
            }
        };
        window.smartphoneInfo.__modWrapped = true;

        if (typeof window.addHook === 'function') {
            // プラグインのロード順によっては portalSelected フックが元の
            // smartphoneInfo を直接参照していて上のラップを経由しない。
            // 自前フックでバー描画後 (setTimeout) に差し込む (差し込みは冪等)。
            window.addHook('portalSelected', function (data) {
                setTimeout(function () {
                    self.decorateMobileinfo(data && data.selectedPortalGuid);
                }, 0);
            });
            // MODは詳細データにのみ含まれ、選択直後にはまだ届いていない。
            // 詳細ロード完了時にバーを再描画して略号を反映する。
            window.addHook('portalDetailsUpdated', function (data) {
                if (data && data.guid && data.guid === window.selectedPortal) {
                    window.smartphoneInfo({ selectedPortalGuid: data.guid });
                }
            });
        }
        return true;
    };

    // 設定変更後にステータスバーを再描画させる
    self.refresh = function () {
        if (window.IITC && IITC.statusbar && IITC.statusbar.portal && window.selectedPortal) {
            IITC.statusbar.portal.update({ selectedPortalGuid: window.selectedPortal });
            return;
        }
        // 旧ビルド: バーを再描画して差し込み直す
        if (window.selectedPortal && typeof window.smartphoneInfo === 'function') {
            window.smartphoneInfo({ selectedPortalGuid: window.selectedPortal });
        }
    };

    // ---- 設定UI ------------------------------------------------------------
    // MOD一覧の並び順: defaultMap の定義順 (MODグループごとにまとまった順序)
    // を維持する。effectiveMap にのみ存在するキー (旧バージョンで手動追加
    // されたもの等) は末尾にソートして追加する。
    self.orderedKeys = function () {
        var out = Object.keys(self.defaultMap).filter(function (k) { return k in self.effectiveMap; });
        var extra = Object.keys(self.effectiveMap).filter(function (k) { return !(k in self.defaultMap); }).sort();
        return out.concat(extra);
    };

    self.showSettings = function () {
        var keys = self.orderedKeys();
        var thStyle = 'text-align:left;font-size:10px;color:#aaa;border-bottom:1px solid #555;padding:1px 3px;';
        var rows = '<tr><th style="' + thStyle + '">MOD</th><th style="' + thStyle + '">略号</th><th style="' + thStyle + '">色</th></tr>';
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var parts = k.split('|');
            var val = self.effectiveMap[k] || '';
            rows += '<tr>' +
                '<td style="padding:1px 3px;white-space:nowrap;font-size:11px;">' + parts[0] + ' (' + parts[1] + ')</td>' +
                '<td><input type="text" data-modkey="' + k + '" value="' + val +
                '" style="width:' + self.MOD_ABBR_INPUT_WIDTH + 'px;"></td>' +
                '<td><input type="color" data-modcolor="' + k + '" value="' + self.colorFor(k) +
                '" style="width:32px;height:18px;padding:0;border:1px solid #555;background:none;vertical-align:middle;"></td>' +
                '</tr>';
        }

        var html = '' +
            '<div style="margin-bottom:8px;">' +
            '<label><input type="checkbox" id="modSbEnabled"' + (self.enabled ? ' checked' : '') + '> MOD略号を表示する</label><br>' +
            '<label><input type="checkbox" id="modSbColored"' + (self.colored ? ' checked' : '') + '> 略号を色付きで表示する</label><br>' +
            '<label><input type="checkbox" id="modSbPrepend"' + (self.prepend ? ' checked' : '') +
            '> ポータルレベル/XMエネルギーの前に挿入する (OFFでその後・ポータル名の前に挿入)</label><br>' +
            '空欄文字: ' +
            '<input type="text" id="modSbBlank" value="' + self.escapeHtml(self.blankChar) + '" style="width:35px;text-align:center;"><br>' +
            '情報バーを右にスライド: ' +
            '<input type="number" id="modSbOffsetX" value="' + self.offsetX + '" min="0" step="1" style="width:50px;text-align:right;"> px' +
            '</div>' +
            '<div style="margin-bottom:4px;">' +
            '<button type="button" id="modSbResetMods">空欄文字・MODアイコン・色を初期化</button>' +
            '</div>' +
            '<div style="max-height:27vh;overflow:auto;border:1px solid #666;">' +
            '<table style="width:100%;border-collapse:collapse;">' + rows + '</table>' +
            '</div>' +
            '<p style="margin:6px 0;font-size:11px;">空欄にするとそのMODは非表示になりますが、' +
            '他にMODが装着されている場合はスロット位置を保つため「空欄文字」で埋められます ' +
            '(例: 1番目が空き/非表示なら「□,RPS,禿,VRHS」)。' +
            '色は mod-overhead と同一の配色が既定です。' +
            '挿入位置の例: ON = 「MOD,MOD,MOD,MOD,L8 100% ポータル名」 / ' +
            'OFF = 「L8 100%,MOD,MOD,MOD,MOD,ポータル名」。' +
            '画面端が丸いスマホでMOD文字が隠れる場合は「情報バーを右にスライド」を' +
            '1px単位で増やして調整してください。</p>';

        var dlg = window.dialog({
            title: 'MOD Statusbar 設定' +
                (plugin_info.script && plugin_info.script.version ? ' v' + plugin_info.script.version : ''),
            html: html,
            width: 300,
            buttons: {
                OK: function () {
                    var root = this;
                    self.enabled = $(root).find('#modSbEnabled').prop('checked');
                    self.colored = $(root).find('#modSbColored').prop('checked');
                    self.prepend = $(root).find('#modSbPrepend').prop('checked');
                    self.blankChar = $(root).find('#modSbBlank').val();
                    var offsetVal = parseInt($(root).find('#modSbOffsetX').val(), 10);
                    self.offsetX = (isFinite(offsetVal) && offsetVal > 0) ? offsetVal : 0;

                    var newUser = {};
                    $(root).find('input[data-modkey]').each(function () {
                        var key = $(this).attr('data-modkey');
                        var v = $(this).val().trim();
                        if (v !== (self.defaultMap[key] || '')) {
                            newUser[key] = v; // 空文字も「非表示」として保持
                        }
                    });

                    // 色は既定色と異なるものだけを保存 (既定色の変更に追従させるため)
                    var newColors = {};
                    $(root).find('input[data-modcolor]').each(function () {
                        var key = $(this).attr('data-modcolor');
                        var v = String($(this).val() || '').toLowerCase();
                        if (v && v !== String(self.defaultColorFor(key)).toLowerCase()) {
                            newColors[key] = v;
                        }
                    });

                    self.userMap = newUser;
                    self.userColors = newColors;
                    self.saveSettings();
                    self.loadSettings();
                    self.applyOffset();
                    self.refresh();
                    $(root).dialog('close');
                }
            }
        });

        // Android実機で、略号入力欄の編集中にオンスクリーンキーボードの
        // カーソル左右移動を行うと、そのイベントが documentまで伝播し、
        // Leaflet地図のキーボード操作ハンドラ (L.Map.Keyboard._onKeyDown。
        // 地図が一度でもフォーカスされていると documentへ直接bindされ、
        // フォーカス中の要素がテキスト入力かどうかを判定せずに矢印キーで
        // 地図をパンしてしまう) 等に反応し、入力中の要素からフォーカスが
        // 外れて文字入力がキャンセルされることがある。まず入力要素の
        // キー操作はdocumentまで伝播させない。
        dlg.on('keydown keyup keypress', 'input', function (e) {
            e.stopPropagation();
        });

        // 上記の伝播遮断だけでは、原因がkeydown以外の経路 (機種依存の
        // IME挙動等、JS側から検知できないもの) の場合にフォーカス飛びを
        // 防ぎきれない。そこで原因を個別に塞ぐのではなく、「ダイアログ内を
        // タップ/クリックした場合、またはTabキーによる移動の場合のみ
        // フォーカス移動を許可し、それ以外の要因でフォーカスが外れたら
        // 直後に元の入力欄へ戻す (カーソル位置も復元する)」という汎用的な
        // 対策を入力欄全般 (略号・空欄文字・色・オフセット) に適用する。
        var pointerDownTarget = null;
        var tabNavigating = false;
        dlg.on('mousedown touchstart', function (e) {
            pointerDownTarget = e.target;
        });
        dlg.on('keydown', 'input', function (e) {
            tabNavigating = (e.key === 'Tab' || e.keyCode === 9);
        });
        dlg.on('blur', 'input', function (e) {
            var input = this;
            var selStart = input.selectionStart;
            var selEnd = input.selectionEnd;
            var allowed = tabNavigating ||
                (pointerDownTarget && $.contains(dlg[0], pointerDownTarget));
            pointerDownTarget = null;
            tabNavigating = false;
            if (allowed) return;
            // 同期的なblur直後はまだ新しいフォーカス先が確定していないため、
            // 1tick後にフォーカス状況を確認してから戻す。
            setTimeout(function () {
                if (!dlg.is(':visible')) return; // OK等で既に閉じた場合は何もしない
                var active = document.activeElement;
                if (active === input || (active && $.contains(dlg[0], active))) return;
                input.focus();
                try {
                    if (input.setSelectionRange) input.setSelectionRange(selStart, selEnd);
                } catch (err) { /* type=color/number等はselectionRange非対応 */ }
            }, 0);
        });

        // 空欄文字・MODアイコン(略号)・MODカラーを全て既定値へ戻す。
        // ダイアログ上の入力欄を書き換えるだけで、OKを押すまで実際の
        // 設定には反映・保存されない。
        dlg.find('#modSbResetMods').on('click', function () {
            dlg.find('#modSbBlank').val(self.DEFAULT_BLANK);
            dlg.find('input[data-modkey]').each(function () {
                var key = $(this).attr('data-modkey');
                $(this).val(self.defaultMap[key] || '');
            });
            dlg.find('input[data-modcolor]').each(function () {
                var key = $(this).attr('data-modcolor');
                $(this).val(self.defaultColorFor(key));
            });
        });
    };

    // ---- setup --------------------------------------------------------------
    var setup = function () {
        self.loadSettings();
        self.applyOffset();

        // 新API (IITC.statusbar.portal) → 旧API (smartphoneInfo/#mobileinfo) の
        // 順で差し込み先を探す。どちらも無くても throw しない。
        // (旧版はここで throw していたため、iOS版アプリ等の旧ビルドで
        //  プラグイン一覧に打ち消し線が引かれ「起動しない」状態になっていた)
        if (self.hookGetData()) {
            // 色付けはHTML描画経路がある場合のみ有効 (無くても略号表示は動作する)
            self.hookRender();
        } else if (!self.hookSmartphoneInfo()) {
            console.warn('mod-statusbar: 対応するステータスバーAPIが見つかりません ' +
                '(IITC.statusbar.portal / smartphoneInfo とも無し)。' +
                'MOD略号は表示されませんが、設定UIは利用できます。');
        }

        // ツールボックスに設定リンクを追加
        $('#toolbox').append(
            $('<a>', {
                text: 'MOD Statusbar',
                title: 'ステータスバーのMOD略号表示を設定',
                click: function () { self.showSettings(); return false; }
            })
        );
    };

    setup.info = plugin_info;
    if (!window.bootPlugins) window.bootPlugins = [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded && typeof setup === 'function') setup();
}

// ---- inject -----------------------------------------------------------------
var script = document.createElement('script');
var info = {};
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
        version: GM_info.script.version,
        name: GM_info.script.name,
        description: GM_info.script.description
    };
}
script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
(document.body || document.head || document.documentElement).appendChild(script);
