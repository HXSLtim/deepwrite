import {
  defineComponent,
  h,
  nextTick,
  ref,
  type WritableComputedRef
} from "vue";
import { describe, expect, it } from "vitest";
import {
  provideConversationDisclosureScope,
  provideConversationDisclosureState,
  useConversationDisclosure,
  useConversationDisclosureScopeClear
} from "./conversationDisclosureState";
import { mountConversationTestComponent } from "./conversation-view.test-support";

describe("conversation disclosure state", () => {
  it("survives details remounts and restores each session independently", async () => {
    const sessionId = ref("session-1");
    const visible = ref(true);
    let open: WritableComputedRef<boolean>;
    const Detail = defineComponent({
      setup() {
        open = useConversationDisclosure(() => "tool-1");
        return () => null;
      }
    });
    const Message = defineComponent({
      setup() {
        provideConversationDisclosureScope(() => "message-1");
        return () => (visible.value ? h(Detail) : null);
      }
    });
    const Parent = defineComponent({
      setup() {
        provideConversationDisclosureState(() => sessionId.value);
        return () => h(Message);
      }
    });
    const unmount = mountConversationTestComponent(Parent);
    expect(open!.value).toBe(false);
    open!.value = true;
    visible.value = false;
    await nextTick();
    visible.value = true;
    await nextTick();
    expect(open!.value).toBe(true);
    sessionId.value = "session-2";
    expect(open!.value).toBe(false);
    sessionId.value = "session-1";
    expect(open!.value).toBe(true);
    unmount();
  });

  it("clears manual disclosure records for one scope only", () => {
    const sessionId = ref("session-1");
    let first: WritableComputedRef<boolean>;
    let second: WritableComputedRef<boolean>;
    let clearFirst: () => void;
    const FirstDetail = defineComponent({
      setup() {
        first = useConversationDisclosure(() => "tool-1");
        return () => null;
      }
    });
    const SecondDetail = defineComponent({
      setup() {
        second = useConversationDisclosure(() => "tool-2");
        return () => null;
      }
    });
    const FirstMessage = defineComponent({
      setup() {
        provideConversationDisclosureScope(() => "message-1");
        clearFirst = useConversationDisclosureScopeClear(() => "message-1");
        return () => h(FirstDetail);
      }
    });
    const SecondMessage = defineComponent({
      setup() {
        provideConversationDisclosureScope(() => "message-2");
        return () => h(SecondDetail);
      }
    });
    const Parent = defineComponent({
      setup() {
        provideConversationDisclosureState(() => sessionId.value);
        return () => [h(FirstMessage), h(SecondMessage)];
      }
    });
    const unmount = mountConversationTestComponent(Parent);
    first!.value = true;
    second!.value = true;
    clearFirst!();
    expect(first!.value).toBe(false);
    expect(second!.value).toBe(true);
    unmount();
  });
});
