// ==UserScript==
// @author         DOPPELGENGER,CLAUDE(MACHINA)
// @id             IITC-plugin-mod-statusbar
// @name           IITC plugin: MOD abbreviation in statusbar
// @category       d.org.addon
// @version        1.2.5
// @namespace      https://github.com/IITC-CE/ingress-intel-total-conversion
// @description    [1.2.5]ステータスバーのポータル名の前後に、装着MODの略号を色付き・スロット位置固定で表示する。ON/OFFトグル、略号・色・空欄文字・挿入位置のユーザーカスタマイズに対応。IITC.statusbar API の無い旧ビルド (iOS版アプリ等) にもフォールバック対応。
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

    // 空きスロット/非表示MODの既定プレースホルダー文字
    self.DEFAULT_BLANK = '□';

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
    self.prepend = true; // true: MOD略号をポータル名の前に挿入 / false: 後ろに挿入

    // ---- 設定の読み書き ---------------------------------------------------
    self.loadSettings = function () {
        self.enabled = (localStorage[self.KEY_ENABLED] !== 'false'); // 既定ON
        self.colored = (localStorage[self.KEY_COLORED] !== 'false'); // 既定ON
        // 空欄文字は未設定時のみ既定値(□)を使う。ユーザーが明示的に空文字へ
        // 変更した場合はそれを尊重する(位置を示す隙間だけを残す用途のため)。
        self.blankChar = (self.KEY_BLANK in localStorage) ? localStorage[self.KEY_BLANK] : self.DEFAULT_BLANK;
        self.prepend = (localStorage[self.KEY_POSITION] !== 'append'); // 既定は前置
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

    // "#RGB" / "#RRGGBB" (#省略可) を小文字の "#rrggbb" へ正規化。不正なら null。
    self.normalizeHex = function (v) {
        v = String(v || '').trim();
        var m = v.match(/^#?([0-9a-fA-F]{6})$/);
        if (m) return ('#' + m[1]).toLowerCase();
        m = v.match(/^#?([0-9a-fA-F]{3})$/);
        if (m) {
            var s = m[1];
            return ('#' + s.charAt(0) + s.charAt(0) + s.charAt(1) + s.charAt(1) +
                    s.charAt(2) + s.charAt(2)).toLowerCase();
        }
        return null;
    };

    // <input type="color"> が使えるか判定 (旧WebView等では text 扱いになる)。
    // ※ iOSアプリ内WebViewでは「対応と判定されるのにパレットが開かない」
    //   事例があるため、判定結果に関わらず16進数の直接入力欄は常に表示する。
    self.colorInputSupported = (function () {
        try {
            var i = document.createElement('input');
            i.setAttribute('type', 'color');
            i.value = '!';
            return i.type === 'color' && i.value !== '!';
        } catch (e) {
            return false;
        }
    })();

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

    // ---- ステータスバーへの差し込み --------------------------------------
    // IITC.statusbar.portal.getData をラップし、返却データの title の前後に
    // MOD略号列を挿入する (self.prepend で前/後を切替)。ネイティブ描画
    // (app.setPortalStatus) と HTML描画 (#mobileinfo) の両経路がこの
    // getData を通るため、これで足りる。
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
            var data = p.__modOrigGetData.call(p, guid);
            if (!self.enabled || !data || !data.title) return data;
            var entries = self.buildModEntries(data.guid || guid);
            if (!entries.length) return data;
            // MOD間はカンマ区切り、タイトル本体とはスペース区切り。
            // 例: "AS,□,禿,VRHS ○○% ポータル名"
            var plain = entries.map(function (e) { return e.abbr; }).join(',');
            var title = self.prepend ? (plain + ' ' + data.title) : (data.title + ' ' + plain);
            var out = Object.assign({}, data, { title: title });
            // render ラップが色付きHTMLへ置換するための情報 (プレーンMOD文字列と
            // 対応する色付きHTML)。render 未対応ビルドでは単に無視される。
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

    // HTML描画経路 (IITC.statusbar.portal.render) をラップし、title先頭に
    // 前置したプレーンな略号列を色付き<span>へ置換する。
    // render が存在しない/挙動が異なるビルドでは何もしない (略号は従来通り
    // プレーンテキストで表示されるだけで、機能は失われない)。
    self.hookRender = function () {
        if (!(window.IITC && IITC.statusbar && IITC.statusbar.portal)) return false;
        var p = IITC.statusbar.portal;
        if (typeof p.render !== 'function') return false;
        if (p.__modOrigRender) return true; // 二重ラップ防止
        p.__modOrigRender = p.render;
        p.render = function (data) {
            var html = p.__modOrigRender.apply(p, arguments);
            if (!self.enabled || !self.colored || typeof html !== 'string') return html;
            if (!data || !data.__modPlain || !data.__modHtml) return html;
            // render側でtitleがHTMLエスケープされる場合に備え、生とエスケープ済みの両方を探す
            var candidates = [data.__modPlain, self.escapeHtml(data.__modPlain)];
            for (var i = 0; i < candidates.length; i++) {
                var idx = html.indexOf(candidates[i]);
                if (idx !== -1) {
                    return html.slice(0, idx) + data.__modHtml + html.slice(idx + candidates[i].length);
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

    // #mobileinfo へMOD略号を差し込む (何度呼んでも二重挿入しない)
    self.decorateMobileinfo = function (guid) {
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
    // 色の入力UI: 16進数のテキスト入力を常設し、<input type="color"> が使える
    // 環境ではパレットも併設する (双方向同期)。パレットが開かない環境
    // (iOS版IITCアプリ等) ではプレビュー用スウォッチのみ表示する。
    self.colorCellHtml = function (attr, key, color) {
        var h = '<input type="text" data-' + attr + '="' + key + '" value="' + color +
                '" maxlength="7" style="width:62px;"> ';
        if (self.colorInputSupported) {
            h += '<input type="color" data-' + attr + 'picker="' + key + '" value="' + color +
                 '" style="width:28px;height:22px;padding:0;border:1px solid #555;background:none;vertical-align:middle;">';
        } else {
            h += '<span data-' + attr + 'swatch="' + key + '" style="display:inline-block;width:18px;height:18px;' +
                 'border:1px solid #555;vertical-align:middle;background:' + color + ';"></span>';
        }
        return h;
    };

    self.showSettings = function () {
        var keys = Object.keys(self.effectiveMap).sort();
        var thStyle = 'text-align:left;font-size:11px;color:#aaa;border-bottom:1px solid #555;padding:2px 6px;';
        var rows = '<tr><th style="' + thStyle + '">MOD</th><th style="' + thStyle + '">略号</th><th style="' + thStyle + '">色</th></tr>';
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var parts = k.split('|');
            var val = self.effectiveMap[k] || '';
            rows += '<tr>' +
                '<td style="padding:2px 6px;white-space:nowrap;">' + parts[0] + ' (' + parts[1] + ')</td>' +
                '<td><input type="text" data-modkey="' + k + '" value="' + val + '" style="width:70px;"></td>' +
                '<td style="white-space:nowrap;">' + self.colorCellHtml('modcolor', k, self.colorFor(k)) + '</td>' +
                '</tr>';
        }

        var html = '' +
            '<div style="margin-bottom:8px;">' +
            '<label><input type="checkbox" id="modSbEnabled"' + (self.enabled ? ' checked' : '') + '> MOD略号を表示する</label><br>' +
            '<label><input type="checkbox" id="modSbColored"' + (self.colored ? ' checked' : '') + '> 略号を色付きで表示する</label><br>' +
            '<label><input type="checkbox" id="modSbPrepend"' + (self.prepend ? ' checked' : '') +
            '> ポータル名の前に挿入する (OFFで後ろに挿入)</label><br>' +
            '空欄文字 (空きスロット/非表示MODの表示): ' +
            '<input type="text" id="modSbBlank" value="' + self.escapeHtml(self.blankChar) + '" style="width:40px;text-align:center;">' +
            '</div>' +
            '<div style="max-height:45vh;overflow:auto;border:1px solid #666;">' +
            '<table style="width:100%;border-collapse:collapse;">' + rows + '</table>' +
            '</div>' +
            '<p style="margin:6px 0;font-size:11px;">略号と色は自由に書き換えられます。空欄にするとそのMODは非表示になりますが、' +
            '他にMODが装着されている場合はスロット位置を保つため「空欄文字」で埋められます ' +
            '(例: 1番目のMODが空き/非表示なら「□,RPS,禿,VRHS」のように表示され、どのスロットが空きか一目で分かります)。' +
            '色は mod-overhead と同一の配色が既定です。' +
            '色はカラーパレットが使えない環境 (iOS版IITCアプリ等) でも「#RRGGBB」形式で直接入力できます。' +
            'ネイティブアプリのステータスバー等、HTML描画に対応しない環境では色は反映されず略号のみ表示されます。' +
            '未知のMODは「正規化名|RARITY」（例: itoentransmuter+|VERY_RARE）の形式で追加してください。' +
            '正規化名 = MOD名を小文字化し、英数字と+−以外を除去したものです。</p>' +
            '<div style="white-space:nowrap;">新規キー: <input type="text" id="modSbNewKey" placeholder="portalshield|COMMON" style="width:145px;"> ' +
            '略号: <input type="text" id="modSbNewVal" placeholder="CPS" style="width:55px;"> ' +
            '色: ' + self.colorCellHtml('modnewcol', 'new', '#3584E4') + '</div>';

        window.dialog({
            title: 'MOD Statusbar 設定' +
                (plugin_info.script && plugin_info.script.version ? ' v' + plugin_info.script.version : ''),
            html: html,
            width: 420,
            buttons: {
                '保存': function () {
                    var root = this;
                    self.enabled = $(root).find('#modSbEnabled').prop('checked');
                    self.colored = $(root).find('#modSbColored').prop('checked');
                    self.prepend = $(root).find('#modSbPrepend').prop('checked');
                    self.blankChar = $(root).find('#modSbBlank').val();

                    var newUser = {};
                    $(root).find('input[data-modkey]').each(function () {
                        var key = $(this).attr('data-modkey');
                        var v = $(this).val().trim();
                        if (v !== (self.defaultMap[key] || '')) {
                            newUser[key] = v; // 空文字も「非表示」として保持
                        }
                    });

                    // 色は既定色と異なるものだけを保存 (既定色の変更に追従させるため)。
                    // 値はテキスト欄 (16進数) から読む。不正な値は無視して既定色に戻す。
                    var newColors = {};
                    $(root).find('input[data-modcolor]').each(function () {
                        var key = $(this).attr('data-modcolor');
                        var v = self.normalizeHex($(this).val());
                        if (v && v !== String(self.defaultColorFor(key)).toLowerCase()) {
                            newColors[key] = v;
                        }
                    });

                    var nk = $(root).find('#modSbNewKey').val().trim();
                    var nv = $(root).find('#modSbNewVal').val().trim();
                    if (nk && nv) {
                        newUser[nk] = nv;
                        var nc = self.normalizeHex($(root).find('input[data-modnewcol]').val());
                        if (nc && nc !== String(self.defaultColorFor(nk)).toLowerCase()) {
                            newColors[nk] = nc;
                        }
                    }

                    self.userMap = newUser;
                    self.userColors = newColors;
                    self.saveSettings();
                    self.loadSettings();
                    self.refresh();
                    $(root).dialog('close');
                },
                '閉じる': function () {
                    $(this).dialog('close');
                }
            }
        });

        // テキスト欄とパレット/スウォッチの双方向同期 (ダイアログ開き直しでも
        // 多重登録されないよう名前空間付きで張り直す)
        var syncFromText = function (input, attr) {
            var hex = self.normalizeHex($(input).val());
            if (!hex) return;
            var key = $(input).attr('data-' + attr);
            $('input[data-' + attr + 'picker]').filter(function () {
                return $(this).attr('data-' + attr + 'picker') === key;
            }).val(hex);
            $('[data-' + attr + 'swatch]').filter(function () {
                return $(this).attr('data-' + attr + 'swatch') === key;
            }).css('background', hex);
        };
        var syncFromPicker = function (input, attr) {
            var key = $(input).attr('data-' + attr + 'picker');
            var hex = String($(input).val() || '');
            $('input[data-' + attr + ']').filter(function () {
                return $(this).attr('data-' + attr) === key;
            }).val(hex);
        };
        $(document).off('.modSbColor')
            .on('input.modSbColor change.modSbColor', 'input[data-modcolor]', function () {
                syncFromText(this, 'modcolor');
            })
            .on('input.modSbColor change.modSbColor', 'input[data-modcolorpicker]', function () {
                syncFromPicker(this, 'modcolor');
            })
            .on('input.modSbColor change.modSbColor', 'input[data-modnewcol]', function () {
                syncFromText(this, 'modnewcol');
            })
            .on('input.modSbColor change.modSbColor', 'input[data-modnewcolpicker]', function () {
                syncFromPicker(this, 'modnewcol');
            });
    };

    // ---- setup --------------------------------------------------------------
    var setup = function () {
        self.loadSettings();

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
