import * as React from 'react';
import PeerJs, { DataConnection, MediaConnection } from 'peerjs';
import { Routes, Route, BrowserRouter, useNavigate } from 'react-router-dom';

type CustomConnection = (DataConnection & { caller?: string }) | undefined;

let peer: PeerJs;
let connection: CustomConnection;
const getUserMedia = navigator.mediaDevices.getUserMedia; //navigator?.getUserMedia || navigator['webkitGetUserMedia'] || navigator['mozGetUserMedia'];

interface ChatMessage {
  id: number;
  self: boolean;
  user: string;
  message: string;
  time: string;
}

const NameInput: React.FC = () => {
  const navigate = useNavigate();
  const [availablePeer, setAvailablePeer] = React.useState(peer);

  const submit = React.useCallback<React.FormEventHandler<HTMLFormElement>>((ev) => {
    const input = ev.currentTarget.elements.namedItem('name') as HTMLInputElement;
    const user = input.value;
    ev.preventDefault();
    setAvailablePeer(new PeerJs(user));
  }, []);

  React.useEffect(() => {
    peer = availablePeer;

    if (availablePeer) {
      navigate('/overview');
    }
  }, [availablePeer]);

  return (
    <form onSubmit={submit}>
      <label>Your name:</label>
      <input name="name" />
      <button>Save</button>
    </form>
  );
};
const Overview: React.FC = () => {
  const navigate = useNavigate();
  const [availablePeer] = React.useState(peer);
  const [availableConnection, setAvailableConnection] = React.useState<DataConnection | undefined>(connection);

  const submit = React.useCallback<React.FormEventHandler<HTMLFormElement>>(
    (ev) => {
      const input = ev.currentTarget.elements.namedItem('name') as HTMLInputElement;
      const otherUser = input.value;
      const connection = availablePeer.connect(otherUser);
      (connection as any).caller = availablePeer.id;
      ev.preventDefault();
      setAvailableConnection(connection);
    },
    [availablePeer],
  );

  React.useEffect(() => {
    connection = availableConnection;

    if (!availablePeer) {
      navigate('/');
    } else if (availableConnection) {
      navigate('/call');
    } else {
      const handler = (connection: CustomConnection) => {
        if (connection) {
          connection.caller = connection?.peer;
          setAvailableConnection(connection);
        }
      };
      peer.on('connection', handler);
      return () => { peer.off('connection', handler) };
    }
  }, [availablePeer, availableConnection]);

  return (
    <div>
      <h1>Hi, {availablePeer?.id}</h1>
      <form onSubmit={submit}>
        <label>Name to call:</label>
        <input name="name" />
        <button>Call</button>
      </form>
    </div>
  );
};

function showVideo(stream: MediaStream, video: HTMLVideoElement, muted: boolean) {
  video.srcObject = stream;
  video.volume = muted ? 0 : 1;
  video.onloadedmetadata = () => video.play();
}

function showStream(call: MediaConnection, otherVideo: HTMLVideoElement) {
  const handler = (remoteStream: MediaStream) => {
    showVideo(remoteStream, otherVideo, false);
  };
  call.on('stream', handler);

  return () => call.off('stream', handler);
}

const Call: React.FC = () => {
  const navigate = useNavigate();
  const otherVideo = React.useRef<HTMLVideoElement>(null);
  const selfVideo = React.useRef<HTMLVideoElement>(null);
  const [messages, setMessages] = React.useState<Array<ChatMessage>>([]);
  const [availablePeer] = React.useState(peer);
  const [availableConnection, setAvailableConnection] = React.useState(connection);

  const appendMessage = React.useCallback(
    (message: string, self: boolean) => {
      if (availableConnection) {
        return setMessages((msgs) => [
          ...msgs,
          {
            id: Date.now(),
            message,
            self,
            time: new Date().toLocaleTimeString(),
            user: self ? availablePeer.id : availableConnection.peer,
          },
        ])
      }
    },
    [],
  );

  React.useEffect(() => {
    if (availableConnection && availablePeer) {
      let dispose = () => { };
      const handler = async (call: MediaConnection) => {
        try {
          const stream = await getUserMedia(
            { video: true, audio: true });

          if (selfVideo.current) {
            showVideo(stream, selfVideo.current, true);
            call.answer(stream);
          }

        } catch (error) {
          console.log('Failed to get local stream', error);
        }

        if (otherVideo.current) {
          dispose = showStream(call, otherVideo.current);
        }
      };
      const makeItWork = async () => {
        if (availableConnection['caller'] === availablePeer.id) {
          try {
            const stream = await getUserMedia(
              { video: true, audio: true });
            if (selfVideo.current) {
              showVideo(stream, selfVideo.current, true);
              if (otherVideo.current) {
                dispose = showStream(availablePeer.call(availableConnection.peer, stream), otherVideo.current);
              }
            };
          } catch (error) {
            console.log('Failed to get local stream', error);
          }
        } else {
          availablePeer.on('call', handler);
        }
      }
      makeItWork();

      return () => {
        availablePeer.off('call', handler);
        dispose();
      };
    }
  }, [availableConnection, availablePeer]);

  React.useEffect(() => {
    connection = availableConnection;

    if (!availableConnection) {
      navigate('/overview');
    } else {
      const dataHandler = (message: unknown) => {
        if (typeof message === "string") {
          appendMessage(message, false);
        }
      };
      const closeHandler = () => {
        setAvailableConnection(undefined);
      };
      availableConnection.on('data', dataHandler);
      availableConnection.on('close', closeHandler);
      return () => {
        availableConnection.off('data', dataHandler);
        availableConnection.off('close', closeHandler);
      };
    }
  }, [availableConnection]);

  const submit = React.useCallback<React.FormEventHandler<HTMLFormElement>>(
    (ev) => {
      const input = ev.currentTarget.elements.namedItem('message') as HTMLInputElement;
      const message = input.value;
      ev.preventDefault();
      availableConnection?.send(message);
      appendMessage(message, true);
      input.value = '';
    },
    [availableConnection],
  );

  const disconnect = React.useCallback(() => {
    availableConnection?.close();
    setAvailableConnection(undefined);
  }, [availableConnection]);

  return (
    <div>
      <h1>
        {availablePeer?.id} ⬄ {availableConnection?.peer} <button onClick={disconnect}>Hang up</button>
      </h1>
      <video ref={otherVideo} width={500} height={500} />
      <video ref={selfVideo} width={200} height={200} />
      <div>
        {messages.map((msg) => (
          <p key={msg.id} style={{ color: msg.self ? '#999' : '#222' }}>
            <b>{msg.user}</b> ({msg.time}): {msg.message}
          </p>
        ))}
      </div>
      <form onSubmit={submit}>
        <input name="message" />
        <button>Send</button>
      </form>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<NameInput />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/call" element={<Call />} />
      </Routes>
    </BrowserRouter>
  );
};
export default App;
